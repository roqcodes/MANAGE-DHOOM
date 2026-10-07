import "server-only";

import { notifyOrderStatusChange, notifyWalletEvent } from "@/modules/admin/services/push-notifications.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { cancelSalesOrder } from "@/modules/orders/services/cancel-sales-order.service";
import {
  creditCustomerWallet,
  restoreOrderInventory,
} from "@/modules/orders/services/order-wallet-inventory.service";

/** Cancel order, restore stock, and refund wallet if the order was paid. */
export async function cancelOrderAndRefund(orderId: string): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data: order, error } = await supabase
    .from("orders")
    .select("id, status, payment_status, total_amount, user_id, inventory_committed, source, store_id")
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!order) throw new Error("Order not found");

  if (order.source === "sales_order") {
    await cancelSalesOrder(orderId, order.store_id ?? undefined);
    return;
  }
  if (order.status === "cancelled") {
    throw new Error("Order is already cancelled.");
  }
  if (order.status === "shipped" || order.status === "delivered") {
    throw new Error("Cannot cancel an order that has been shipped.");
  }
  if (order.payment_status === "refunded") {
    throw new Error("Order has already been refunded.");
  }

  const { data: activeInvoice } = await supabase
    .from("invoices")
    .select("id, status")
    .eq("order_id", orderId)
    .neq("status", "cancelled")
    .limit(1)
    .maybeSingle();

  if (activeInvoice) {
    throw new Error(
      "Cannot cancel an order with an active invoice. Cancel the invoice first.",
    );
  }

  const wasPaid = order.payment_status === "paid";
  const refundAmount = Number(order.total_amount ?? 0);

  await restoreOrderInventory(orderId);

  if (wasPaid) {
    if (!order.user_id) {
      throw new Error("Order has no customer to refund.");
    }
    if (refundAmount <= 0) {
      throw new Error("Order total is invalid for refund.");
    }

    await creditCustomerWallet(
      order.user_id,
      refundAmount,
      `Refund for cancelled order ${orderId}`,
    );
  }

  const { error: updateErr } = await supabase
    .from("orders")
    .update({
      status: "cancelled",
      payment_status: wasPaid ? "refunded" : order.payment_status,
    })
    .eq("id", orderId);

  if (updateErr) throw new Error(updateErr.message);
  await notifyOrderStatusChange(orderId, "cancelled").catch(() => undefined);
  if (wasPaid && order.user_id) {
    await notifyWalletEvent({
      userId: order.user_id,
      eventKey: "wallet.credited",
      amount: refundAmount,
      reference: `Refund for ${orderId.slice(0, 8).toUpperCase()}`,
    }).catch(() => undefined);
  }
}
