import "server-only";

import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";

import type { RecordKind } from "./record-target";

export type ResolvedEntityOpen = {
  href: string;
  label: string;
  kind: RecordKind;
  subtitle?: string;
};

function sanitizeIlike(q: string) {
  return q.replace(/[%_,()]/g, " ").trim().slice(0, 80);
}

function displayName(row: {
  name?: string | null;
  company_name?: string | null;
  contact_display_name?: string | null;
}) {
  return (
    row.company_name?.trim() ||
    row.contact_display_name?.trim() ||
    row.name?.trim() ||
    "Unknown"
  );
}

async function searchCustomers(fragment: string) {
  const supabase = await createSupabaseServerClient();
  const q = sanitizeIlike(fragment);
  if (q.length < 2) return [];
  const { data, error } = await supabase
    .from("users")
    .select("id, name, company_name, contact_display_name, phone, customer_number, role")
    .or(
      `name.ilike.%${q}%,company_name.ilike.%${q}%,contact_display_name.ilike.%${q}%,customer_number.ilike.%${q}%,phone.ilike.%${q}%`,
    )
    .limit(8);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function searchVendors(fragment: string) {
  const supabase = await createSupabaseServerClient();
  const q = sanitizeIlike(fragment);
  if (q.length < 2) return [];
  const { data, error } = await supabase
    .from("vendors")
    .select("id, name, email, phone")
    .or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`)
    .limit(8);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function resolveInvoice(fragment: string): Promise<ResolvedEntityOpen | null> {
  const supabase = await createSupabaseServerClient();
  const q = sanitizeIlike(fragment);
  let query = supabase
    .from("invoices")
    .select("id, invoice_number")
    .order("created_at", { ascending: false })
    .limit(8);
  if (q.length >= 2) query = query.ilike("invoice_number", `%${q}%`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const row = data?.[0];
  if (!row) return null;
  return {
    href: `/admin/erp/invoices/${row.id}`,
    label: row.invoice_number || "Invoice",
    kind: "invoice",
    subtitle: "Tax invoice",
  };
}

async function resolvePurchaseBill(fragment: string): Promise<ResolvedEntityOpen | null> {
  const supabase = await createSupabaseServerClient();
  const q = sanitizeIlike(fragment);
  let query = supabase
    .from("erp_purchase_bills")
    .select("id, purchase_bill_number")
    .order("created_at", { ascending: false })
    .limit(8);
  if (q.length >= 2) query = query.ilike("purchase_bill_number", `%${q}%`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const row = data?.[0];
  if (!row) return null;
  return {
    href: `/admin/erp/purchase-bills/${row.id}`,
    label: row.purchase_bill_number || "Purchase bill",
    kind: "bill",
    subtitle: "Purchase bill",
  };
}

function scoreHit(
  tokens: string[],
  label: string,
  extra: Array<string | null | undefined>,
): number {
  const hay = [label, ...extra.filter(Boolean)].join(" ").toLowerCase();
  let score = 0;
  for (const t of tokens) {
    const n = t.toLowerCase();
    if (!n) continue;
    if (hay === n) score += 50;
    else if (hay.includes(n)) score += 12;
  }
  return score;
}

export async function resolveEntityOpen(input: {
  kind: RecordKind;
  query: string;
  tokens?: string[];
}): Promise<ResolvedEntityOpen | null> {
  const tokens = input.tokens?.length ? input.tokens : [input.query];
  const q = input.query.trim();
  if (q.length < 2 && tokens.every((t) => t.length < 2)) return null;

  if (input.kind === "customer") {
    const queries = [...new Set([q, ...tokens])].filter((x) => x.length >= 2).slice(0, 3);
    const hits: Array<{ id: string; label: string; score: number; phone?: string | null }> =
      [];
    for (const fragment of queries) {
      const rows = await searchCustomers(fragment);
      for (const row of rows) {
        const label = displayName(row);
        hits.push({
          id: row.id,
          label,
          phone: row.phone,
          score: scoreHit(tokens, label, [row.phone, row.customer_number]),
        });
      }
    }
    hits.sort((a, b) => b.score - a.score);
    const best = hits[0];
    if (!best || best.score < 8) return null;
    return {
      href: `/admin/customers/${best.id}`,
      label: best.label,
      kind: "customer",
      subtitle: best.phone ? `Mobile ${best.phone}` : "Customer",
    };
  }

  if (input.kind === "vendor") {
    const rows = await searchVendors(q);
    const ranked = rows
      .map((row) => ({
        id: row.id,
        label: row.name?.trim() || "Vendor",
        score: scoreHit(tokens, row.name || "", [row.email, row.phone]),
      }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (!best) return null;
    return {
      href: `/admin/vendors/${best.id}`,
      label: best.label,
      kind: "vendor",
      subtitle: "Vendor",
    };
  }

  if (input.kind === "invoice") return resolveInvoice(q);
  if (input.kind === "bill") return resolvePurchaseBill(q);

  return null;
}
