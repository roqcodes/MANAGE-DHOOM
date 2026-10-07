import "server-only";

import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { getCurrentSessionProfile } from "@/modules/auth/services/auth.service";
import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";

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

export async function getCreditLimit(userId: string): Promise<CreditLimitInfo | null> {
  const supabase = await createSupabaseServerClient();

  // Get credit limit
  const { data: creditData } = await supabase
    .from("customer_credit_limits")
    .select("credit_limit")
    .eq("user_id", userId)
    .maybeSingle();

  const creditLimit = creditData?.credit_limit ?? 0;

  // Calculate outstanding balance from invoices
  const { data: invoices } = await supabase
    .from("invoices")
    .select("total_amount, status")
    .eq("user_id", userId)
    .in("status", ["pending", "partial"]);

  const outstandingBalance =
    invoices?.reduce((sum, inv) => sum + (inv.total_amount ?? 0), 0) ?? 0;

  if (creditLimit === 0) {
    return null;
  }

  return {
    userId,
    creditLimit,
    outstandingBalance,
    availableCredit: creditLimit - outstandingBalance,
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

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("customer_credit_limits")
    .upsert({
      user_id: userId,
      credit_limit: creditLimit,
    })
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
}

export async function checkCreditLimit(
  userId: string,
  orderAmount: number,
): Promise<{ ok: boolean; available: number; required: number }> {
  const creditInfo = await getCreditLimit(userId);

  if (!creditInfo) {
    // No credit limit set - order can proceed without credit check
    return { ok: true, available: 0, required: orderAmount };
  }

  const available = creditInfo.availableCredit;
  const wouldExceed = available < orderAmount;

  return {
    ok: !wouldExceed,
    available,
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

  // Get transactions
  const { data: transactions, count: txCount } = await supabase
    .from("transactions")
    .select("id, type, amount, reference, created_at", { count: "exact" })
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .range(from, from + limit - 1);

  // Get wallet balance
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
