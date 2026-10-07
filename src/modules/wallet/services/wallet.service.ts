import "server-only";

import { notifyWalletEvent } from "@/modules/admin/services/push-notifications.service";
import { getCurrentSessionProfile } from "@/modules/auth/services/auth.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";

export interface WalletBalance {
  balance: number;
  userId: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  amount: number;
  type: "credit" | "debit";
  reference: string | null;
  created_at: string;
}

export interface WalletTopUpInput {
  amount: number;
  reference?: string;
}

export interface WalletDebitInput {
  amount: number;
  reference: string;
}

const PAGE_SIZE = 50;

/**
 * Get current user's wallet balance.
 */
export async function getWalletBalance(): Promise<number> {
  const { user } = await getCurrentSessionProfile();
  if (!user) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("get_wallet_balance", {
    p_user_id: user.id,
  });

  if (error) {
    throw new Error(error.message);
  }

  return (data as number) || 0;
}

/**
 * Get wallet with full row data.
 */
export async function getWallet() {
  const { user } = await getCurrentSessionProfile();
  if (!user) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("wallet")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

/**
 * Top up wallet balance.
 */
export async function topUpWallet(input: WalletTopUpInput): Promise<number> {
  const { user } = await getCurrentSessionProfile();
  if (!user) {
    throw new Error("Unauthorized: User not authenticated");
  }

  if (!input.amount || input.amount <= 0) {
    throw new Error("Amount must be greater than 0");
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("wallet_top_up", {
    p_amount: input.amount,
    p_reference: input.reference || "Wallet top-up",
  });

  if (error) {
    throw new Error(error.message);
  }

  await notifyWalletEvent({
    userId: user.id,
    eventKey: "wallet.topup",
    amount: input.amount,
    reference: input.reference || "Wallet top-up",
  }).catch(() => undefined);

  return data as number;
}
export async function debitWallet(input: WalletDebitInput): Promise<number> {
  const { user } = await getCurrentSessionProfile();
  if (!user) {
    throw new Error("Unauthorized: User not authenticated");
  }

  if (!input.amount || input.amount <= 0) {
    throw new Error("Amount must be greater than 0");
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("wallet_debit", {
    p_amount: input.amount,
    p_reference: input.reference,
  });

  if (error) {
    throw new Error(error.message);
  }

  await notifyWalletEvent({
    userId: user.id,
    eventKey: "wallet.debited",
    amount: input.amount,
    reference: input.reference,
  }).catch(() => undefined);

  return data as number;
}
export async function getTransactions(
  page = 0,
): Promise<{
  transactions: Transaction[];
  total: number;
  hasMore: boolean;
}> {
  const { user } = await getCurrentSessionProfile();
  if (!user) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const supabase = await createSupabaseServerClient();
  const offset = page * PAGE_SIZE;

  const [transactionsRes, countRes] = await Promise.all([
    supabase.rpc("get_transactions_for_user", {
      p_user_id: user.id,
      p_limit: PAGE_SIZE,
      p_offset: offset,
    }),
    supabase.rpc("get_transactions_count", {
      p_user_id: user.id,
    }),
  ]);

  if (transactionsRes.error) {
    throw new Error(transactionsRes.error.message);
  }

  if (countRes.error) {
    throw new Error(countRes.error.message);
  }

  const transactions = (transactionsRes.data as unknown as Transaction[]) || [];
  const total = countRes.data as number;

  return {
    transactions,
    total,
    hasMore: offset + transactions.length < total,
  };
}

/**
 * Pay for order using wallet.
 * Combines debit wallet + update order payment status.
 */
export async function payForOrder(
  orderId: string,
  amount: number,
): Promise<{
  success: boolean;
  remainingBalance: number;
  transactionId: string;
}> {
  const { user } = await getCurrentSessionProfile();
  if (!user) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const supabase = await createSupabaseServerClient();

  // Verify order belongs to user
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, user_id, payment_status")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) {
    throw new Error(orderError.message);
  }

  if (!order) {
    throw new Error("Order not found");
  }

  if (order.user_id !== user.id) {
    throw new Error("Order does not belong to user");
  }

  if (order.payment_status === "paid") {
    throw new Error("Order already paid");
  }

  // Debit wallet
  const remainingBalance = await debitWallet({
    amount,
    reference: `Payment for order ${orderId}`,
  });

  // Update order payment status
  const { error: updateError } = await supabase
    .from("orders")
    .update({ payment_status: "paid" })
    .eq("id", orderId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  // Get transaction ID
  const { data: transaction } = await supabase
    .from("transactions")
    .select("id")
    .eq("user_id", user.id)
    .eq("reference", `Payment for order ${orderId}`)
    .order("created_at", { ascending: false })
    .maybeSingle();

  return {
    success: true,
    remainingBalance,
    transactionId: transaction?.id || "",
  };
}
