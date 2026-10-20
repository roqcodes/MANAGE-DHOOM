import "server-only";

import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { getCurrentSessionProfile } from "@/modules/auth/services/auth.service";
import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  formatInvoiceCreditExceededMessage,
  type InvoiceCreditHeadroom,
} from "@/common/erp/invoice-credit-messages";
import { roundMoney } from "@/common/erp/purchasing-types";
import { staffCustomerCreditLimitsClient } from "@/lib/erp/customer-credit-limits-db";

export type { InvoiceCreditHeadroom } from "@/common/erp/invoice-credit-messages";

export async function getCustomerArExposure(
  userId: string,
  excludeInvoiceId?: string | null,
): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_customer_ar_exposure", {
    p_user_id: userId,
    p_exclude_invoice_id: excludeInvoiceId ?? null,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

export async function getInvoiceCreditHeadroom(
  userId: string,
  excludeInvoiceId?: string | null,
): Promise<InvoiceCreditHeadroom> {
  const supabase = await createSupabaseServerClient();
  const creditLimit = await loadCreditLimitRow(supabase, userId);
  const outstanding = await getCustomerArExposure(userId, excludeInvoiceId);
  if (creditLimit == null) {
    return { hasLimit: false, creditLimit: null, outstanding, available: null };
  }
  return {
    hasLimit: true,
    creditLimit,
    outstanding,
    available: roundMoney(creditLimit - outstanding),
  };
}

/** Same rules as assert_customer_credit_headroom on create/update invoice. */
export async function assertInvoiceCreditHeadroom(
  userId: string,
  invoiceTotal: number,
  excludeInvoiceId?: string | null,
): Promise<void> {
  if (!userId || invoiceTotal <= 0) return;

  const headroom = await getInvoiceCreditHeadroom(userId, excludeInvoiceId);
  if (!headroom.hasLimit || headroom.creditLimit == null || headroom.available == null) {
    return;
  }

  if (headroom.outstanding + invoiceTotal > headroom.creditLimit + 0.0001) {
    throw new Error(
      formatInvoiceCreditExceededMessage(
        headroom.creditLimit,
        headroom.outstanding,
        headroom.available,
        invoiceTotal,
      ),
    );
  }
}

/** Credit limit must cover opening balance + open invoice balance (same as invoice enforcement). */
export async function assertCreditLimitAtLeastExposure(
  userId: string,
  creditLimit: number,
): Promise<void> {
  if (creditLimit <= 0) return;
  const exposure = await getCustomerArExposure(userId);
  if (creditLimit + 0.0001 < exposure) {
    throw new Error(
      `Credit limit cannot be less than the customer's current balance (${roundMoney(exposure)}). Raise the limit or clear receivables first.`,
    );
  }
}

export interface CreditLimitInfo {
  userId: string;
  creditLimit: number;
  outstandingBalance: number;
  availableCredit: number;
}

export interface LedgerEntry {
  id: string;
  type: string;
  amount: number;
  balance_after: number | null;
  reference: string | null;
  created_at: string;
}

async function loadCreditLimitRow(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
): Promise<number | null> {
  const { data, error } = await supabase
    .from("customer_credit_limits")
    .select("credit_limit")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data?.credit_limit == null || Number(data.credit_limit) <= 0) {
    return null;
  }
  return Number(data.credit_limit);
}

export async function getCreditLimit(userId: string): Promise<CreditLimitInfo | null> {
  const supabase = await createSupabaseServerClient();
  const creditLimit = await loadCreditLimitRow(supabase, userId);
  if (creditLimit == null) {
    return null;
  }

  const { data: exposure, error: exposureErr } = await supabase.rpc(
    "get_customer_ar_exposure",
    { p_user_id: userId, p_exclude_invoice_id: null },
  );
  if (exposureErr) throw new Error(exposureErr.message);

  const outstandingBalance = Number(exposure ?? 0);
  const availableCredit = creditLimit - outstandingBalance;

  return {
    userId,
    creditLimit,
    outstandingBalance,
    availableCredit,
  };
}

export async function getMyCreditLimit(): Promise<CreditLimitInfo | null> {
  const { profile } = await getCurrentSessionProfile();

  if (!profile) {
    throw new Error("Unauthorized: User not authenticated");
  }

  return getCreditLimit(profile.id);
}

export async function setCreditLimit(
  userId: string,
  creditLimit: number,
): Promise<void> {
  await requireAdminApiProfile();

  if (creditLimit < 0) {
    throw new Error("Credit limit cannot be negative");
  }

  const supabase = await staffCustomerCreditLimitsClient();

  if (creditLimit <= 0) {
    const { error } = await supabase
      .from("customer_credit_limits")
      .delete()
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return;
  }

  await assertCreditLimitAtLeastExposure(userId, creditLimit);

  const { error } = await supabase.from("customer_credit_limits").upsert(
    {
      user_id: userId,
      credit_limit: creditLimit,
    },
    { onConflict: "user_id" },
  );

  if (error) throw new Error(error.message);
}

export async function checkCreditLimit(
  userId: string,
  orderAmount: number,
): Promise<{ ok: boolean; available: number; required: number }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("check_credit_limit", {
    p_user_id: userId,
    p_order_amount: orderAmount,
  });
  if (error) throw new Error(error.message);

  const creditInfo = await getCreditLimit(userId);
  if (!creditInfo) {
    return { ok: true, available: 0, required: orderAmount };
  }

  return {
    ok: Boolean(data),
    available: creditInfo.availableCredit,
    required: orderAmount,
  };
}

export async function getMyLedger(
  page = 0,
  limit = 20,
): Promise<{ entries: LedgerEntry[]; total: number }> {
  const { profile } = await getCurrentSessionProfile();

  if (!profile) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const supabase = await createSupabaseServerClient();
  const from = page * limit;

  const { data: transactions, count: txCount } = await supabase
    .from("transactions")
    .select("id, type, amount, reference, created_at", { count: "exact" })
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .range(from, from + limit - 1);

  const { data: wallet } = await supabase
    .from("wallet")
    .select("balance")
    .eq("user_id", profile.id)
    .maybeSingle();

  const entries: LedgerEntry[] = (transactions ?? []).map((tx) => ({
    id: tx.id,
    type: tx.type ?? "",
    amount: tx.amount ?? 0,
    balance_after: wallet?.balance ?? null,
    reference: tx.reference,
    created_at: tx.created_at,
  }));

  return {
    entries,
    total: txCount ?? 0,
  };
}

export async function getCustomerLedger(
  userId: string,
  page = 0,
  limit = 20,
): Promise<{ entries: LedgerEntry[]; total: number }> {
  await requireAdminApiProfile();

  const supabase = await createSupabaseServerClient();
  const from = page * limit;

  const { data: transactions, count: txCount } = await supabase
    .from("transactions")
    .select("id, type, amount, reference, created_at", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(from, from + limit - 1);

  const { data: wallet } = await supabase
    .from("wallet")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();

  const entries: LedgerEntry[] = (transactions ?? []).map((tx) => ({
    id: tx.id,
    type: tx.type ?? "",
    amount: tx.amount ?? 0,
    balance_after: wallet?.balance ?? null,
    reference: tx.reference,
    created_at: tx.created_at,
  }));

  return {
    entries,
    total: txCount ?? 0,
  };
}
