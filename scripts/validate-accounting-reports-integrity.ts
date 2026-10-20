/**
 * DB integration checks against migrated Supabase (staff session or service role).
 *
 *   set ACCOUNTING_INTEGRATION=1
 *   set NEXT_PUBLIC_SUPABASE_URL=...
 *   set NEXT_PUBLIC_SUPABASE_ANON_KEY=...
 *   set SUPABASE_SERVICE_ROLE_KEY=...
 *   npm run erp:accounting:validate
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function createStaffRpcClient(
  url: string,
  serviceKey: string,
  anonKey: string,
): Promise<SupabaseClient> {
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const password = process.env.ACCOUNTING_STAFF_PASSWORD;
  const emailOverride = process.env.ACCOUNTING_STAFF_EMAIL;

  let email = emailOverride ?? null;
  if (!email) {
    const { data: staffRow, error: staffErr } = await admin
      .from("users")
      .select("email")
      .in("role", ["admin", "manager"])
      .not("email", "is", null)
      .limit(1)
      .maybeSingle();
    if (staffErr) {
      console.warn("Could not resolve staff email from public.users:", staffErr.message);
    }
    email = staffRow?.email ?? null;
  }

  const rpc = createClient(url, anonKey, { auth: { persistSession: false } });

  if (email && password) {
    const { error: signInErr } = await rpc.auth.signInWithPassword({ email, password });
    if (signInErr) throw new Error(`Staff sign-in failed: ${signInErr.message}`);
    return rpc;
  }

  if (email) {
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkErr) throw new Error(`Staff magic link failed: ${linkErr.message}`);
    const tokenHash = linkData.properties?.hashed_token;
    if (!tokenHash) {
      throw new Error("Staff magic link missing hashed_token");
    }
    const { error: otpErr } = await rpc.auth.verifyOtp({
      type: "magiclink",
      token_hash: tokenHash,
    });
    if (otpErr) throw new Error(`Staff OTP verify failed: ${otpErr.message}`);
    return rpc;
  }

  console.warn("No staff email found; falling back to service_role client (may fail on staff-only RPCs).");
  return admin;
}

async function main(): Promise<void> {
  if (process.env.ACCOUNTING_INTEGRATION !== "1") {
    console.log(
      "Skipping accounting DB integration (set ACCOUNTING_INTEGRATION=1 and Supabase env vars to run).",
    );
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  assert(Boolean(url && serviceKey && anonKey), "NEXT_PUBLIC_SUPABASE_URL, ANON_KEY, and SERVICE_ROLE_KEY required");

  const supabase = await createStaffRpcClient(url!, serviceKey!, anonKey!);

  const { data: unbalanced, error: ubErr } = await supabase.rpc("erp_audit_unbalanced_journals", {
    p_limit: 50,
  });
  if (ubErr) throw new Error(`erp_audit_unbalanced_journals: ${ubErr.message}`);
  const ubRows = Array.isArray(unbalanced) ? unbalanced : [];
  assert(ubRows.length === 0, `Unbalanced journals found: ${ubRows.length}`);
  console.log("erp_audit_unbalanced_journals: OK (0 unbalanced)");

  const yearStart = `${new Date().getFullYear()}-01-01`;
  const today = new Date().toISOString().slice(0, 10);

  const { data: missingCogs, error: mcErr } = await supabase.rpc("erp_audit_missing_sale_cogs_gl", {
    p_date_from: yearStart,
    p_date_to: today,
    p_limit: 200,
  });
  if (mcErr) throw new Error(`erp_audit_missing_sale_cogs_gl: ${mcErr.message}`);
  const gaps = Array.isArray(missingCogs) ? missingCogs : [];
  console.log(
    `erp_audit_missing_sale_cogs_gl: ${gaps.length} invoice(s) with COGS gap > 0.01 (historical sales may appear until backfill).`,
  );
  if (gaps.length > 0) {
    const preview = gaps.slice(0, 5) as Array<{
      invoice_number?: string;
      cogs_gap?: number;
      expected_cogs?: number;
      posted_cogs?: number;
    }>;
    for (const row of preview) {
      console.log(
        `  - ${row.invoice_number ?? "?"} gap=${row.cogs_gap} (expected=${row.expected_cogs}, posted=${row.posted_cogs})`,
      );
    }
    if (gaps.length > 5) {
      console.log(`  ... and ${gaps.length - 5} more`);
    }
  }

  const { data: pl, error: plErr } = await supabase.rpc("get_erp_profit_and_loss", {
    p_date_from: yearStart,
    p_date_to: today,
  });
  if (plErr) throw new Error(`get_erp_profit_and_loss: ${plErr.message}`);
  const plObj = pl as Record<string, unknown>;
  const income = Number(plObj.total_income ?? 0);
  const cogs = Number(plObj.total_cogs ?? 0);
  const opex = Number(plObj.total_operating_expenses ?? 0);
  const gross = Number(plObj.gross_profit ?? income - cogs);
  const net = Number(plObj.net_profit ?? 0);
  assert(
    Math.abs(gross - (income - cogs)) < 0.02,
    `P&L gross_profit mismatch: ${gross} vs ${income - cogs}`,
  );
  assert(
    Math.abs(net - (income - cogs - opex)) < 0.02,
    `P&L net_profit mismatch: ${net} vs ${income - cogs - opex}`,
  );
  console.log(
    `get_erp_profit_and_loss: OK (income=${income}, cogs=${cogs}, gross=${gross}, net=${net})`,
  );

  const { data: dash, error: dashErr } = await supabase.rpc("get_erp_financial_dashboard", {
    p_date_from: yearStart,
    p_date_to: today,
  });
  if (dashErr) throw new Error(`get_erp_financial_dashboard: ${dashErr.message}`);
  const dashObj = dash as Record<string, unknown>;
  assert(
    Math.abs(Number(dashObj.net_profit_ytd ?? 0) - net) < 0.02,
    "Finance dashboard net_profit_ytd does not match P&L net_profit",
  );
  assert(
    Math.abs(Number(dashObj.cogs_ytd ?? 0) - cogs) < 0.02,
    "Finance dashboard cogs_ytd does not match P&L total_cogs",
  );
  console.log("get_erp_financial_dashboard: OK (aligned with P&L)");

  console.log("Accounting integration checks completed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
