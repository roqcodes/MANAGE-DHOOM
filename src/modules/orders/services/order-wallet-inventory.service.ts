import "server-only";

import { notifyWalletEvent } from "@/modules/admin/services/push-notifications.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { invokeRpc } from "@/lib/integrations/supabase/rpc";
import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";

/**
 * Online: reserve stock via fulfillments.
 * POS/ERP (manual, sales_order): immediate physical deduct at store.
 */
export async function commitOrderInventory(orderId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("inventory_apply_order_stock", {
    p_order_id: orderId,
    p_multiplier: -1,
  });
  if (error) throw new Error(error.message);
}

/** Release reservations (online) or restore physical stock (POS/ERP). */
export async function restoreOrderInventory(orderId: string): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("inventory_apply_order_stock", {
    p_order_id: orderId,
    p_multiplier: 1,
  });
  if (error) throw new Error(error.message);
}

/** Ship all pending fulfillments for an online order (physical deduct). */
export async function shipOrderFulfillments(orderId: string): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { error } = await invokeRpc(supabase, "ship_all_order_fulfillments", {
    p_order_id: orderId,
  });
  if (error) throw new Error(error.message);
}

/** Staff assigns a store to a pending-assignment online order. */
export async function assignOrderFulfillmentStore(
  orderId: string,
  storeId: string,
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { error } = await invokeRpc(supabase, "assign_order_fulfillment_store", {
    p_order_id: orderId,
    p_store_id: storeId,
  });
  if (error) throw new Error(error.message);
}

/** Credit a customer's wallet (admin/manager only — uses security definer RPC). */
export async function creditCustomerWallet(
  userId: string,
  amount: number,
  reference: string,
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("wallet_credit_user", {
    p_user_id: userId,
    p_amount: amount,
    p_reference: reference,
  });
  if (error) throw new Error(error.message);
  await notifyWalletEvent({
    userId,
    eventKey: "wallet.credited",
    amount,
    reference,
  }).catch(() => undefined);
}

/** Debit a customer's wallet (admin/manager only — uses security definer RPC). */
export async function debitCustomerWallet(
  userId: string,
  amount: number,
  reference: string,
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("wallet_debit_user", {
    p_user_id: userId,
    p_amount: amount,
    p_reference: reference,
  });
  if (error) throw new Error(error.message);
  await notifyWalletEvent({
    userId,
    eventKey: "wallet.debited",
    amount,
    reference,
  }).catch(() => undefined);
}
