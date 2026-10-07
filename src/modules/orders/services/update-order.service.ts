import "server-only";

import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type { Database } from "@/lib/integrations/supabase/types";
import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { buildOrderItemSnapshots } from "@/modules/orders/services/order-item-pricing.service";
import {
  commitOrderInventory,
  creditCustomerWallet,
  debitCustomerWallet,
  restoreOrderInventory,
} from "@/modules/orders/services/order-wallet-inventory.service";

export interface UpdateOrderLineInput {
  variantId: string;
  quantity: number;
  /** Catalog list price per unit (before line discount). */
  listPrice: number;
  /** Final unit price after line discount. */
  unitPrice: number;
}

export interface UpdateOrderWithItemsInput {
  items: UpdateOrderLineInput[];
  orderDiscount?: number;
  status?: string;
  paymentStatus?: string;
  merchantNote?: string | null;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function updateOrderWithItems(
  orderId: string,
  input: UpdateOrderWithItemsInput,
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select(
      "id,status,payment_status,total_amount,user_id,inventory_committed",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr) throw new Error(orderErr.message);
  if (!order) throw new Error("Order not found");
  if (order.status === "cancelled") {
    throw new Error("Cannot edit a cancelled order.");
  }
  if (order.payment_status === "refunded") {
    throw new Error("Cannot edit a refunded order.");
  }

  if (!input.items.length) {
    throw new Error("Order must have at least one line item.");
  }

  const inventoryWasCommitted = Boolean(order.inventory_committed);
  if (inventoryWasCommitted) {
    await restoreOrderInventory(orderId);
  }

  const lineSnapshots: {
    productId: string;
    variantId: string;
    quantity: number;
    vendorId: string | null;
    basePrice: number;
    finalPrice: number;
    marginAmount: number;
    productName: string;
    listPrice: number;
  }[] = [];

  const pricingSnapshots = await buildOrderItemSnapshots(
    input.items.map((item) => ({
      variantId: item.variantId,
      quantity: Math.max(1, Math.floor(item.quantity)),
      unitPriceOverride: roundMoney(Math.max(0, item.unitPrice)),
    })),
  );

  for (const item of input.items) {
    const qty = Math.max(1, Math.floor(item.quantity));
    const listPrice = roundMoney(Math.max(0, item.listPrice));
    const finalPrice = roundMoney(Math.max(0, item.unitPrice));

    const snapshot = pricingSnapshots.get(item.variantId);
    if (!snapshot) throw new Error("Variant or product not found.");

    lineSnapshots.push({
      productId: snapshot.product_id,
      variantId: item.variantId,
      quantity: qty,
      vendorId: snapshot.vendor_id,
      basePrice: snapshot.base_price,
      finalPrice: snapshot.final_price,
      marginAmount: snapshot.margin_amount,
      productName: snapshot.product_name,
      listPrice,
    });
  }

  const subtotal = roundMoney(
    lineSnapshots.reduce((sum, row) => sum + row.listPrice * row.quantity, 0),
  );
  const lineTotal = roundMoney(
    lineSnapshots.reduce((sum, row) => sum + row.finalPrice * row.quantity, 0),
  );
  const orderDiscount = roundMoney(Math.max(0, input.orderDiscount ?? 0));
  const lineDiscount = roundMoney(subtotal - lineTotal);
  const totalDiscount = roundMoney(lineDiscount + orderDiscount);
  const tax = 0;
  const grandTotal = roundMoney(Math.max(0, subtotal - totalDiscount + tax));

  const oldTotal = Number(order.total_amount ?? 0);
  const wasPaid = order.payment_status === "paid";

  try {
    const { error: deleteErr } = await supabase
      .from("order_items")
      .delete()
      .eq("order_id", orderId);

    if (deleteErr) throw new Error(deleteErr.message);

    const insertRows = lineSnapshots.map((row) => ({
      order_id: orderId,
      product_id: row.productId,
      variant_id: row.variantId,
      quantity: row.quantity,
      price: row.finalPrice,
      vendor_id: row.vendorId,
      base_price: row.basePrice,
      final_price: row.finalPrice,
      margin_amount: row.marginAmount,
      product_name: row.productName,
    }));

    const { error: insertErr } = await supabase
      .from("order_items")
      .insert(insertRows);

    if (insertErr) {
      throw new Error(`Failed to update line items: ${insertErr.message}`);
    }

    await commitOrderInventory(orderId);
  } catch (err) {
    if (inventoryWasCommitted) {
      try {
        await commitOrderInventory(orderId);
      } catch {
        // Best-effort rollback of inventory after a failed edit.
      }
    }
    throw err instanceof Error ? err : new Error("Failed to update order items.");
  }

  if (wasPaid && order.user_id) {
    const diff = roundMoney(grandTotal - oldTotal);
    const ref = `Order edit ${orderId}`;
    if (diff > 0) {
      await debitCustomerWallet(order.user_id, diff, ref);
    } else if (diff < 0) {
      await creditCustomerWallet(order.user_id, Math.abs(diff), ref);
    }
  }

  const updatePayload: Database["public"]["Tables"]["orders"]["Update"] = {
    total_amount: grandTotal,
    subtotal,
    tax,
    discount: totalDiscount,
  };

  if (input.status !== undefined) updatePayload.status = input.status;
  if (input.paymentStatus !== undefined) {
    updatePayload.payment_status = input.paymentStatus;
  }
  if (input.merchantNote !== undefined) {
    updatePayload.merchant_note = input.merchantNote;
  }

  const { error: updateErr } = await supabase
    .from("orders")
    .update(updatePayload)
    .eq("id", orderId);

  if (updateErr) throw new Error(updateErr.message);
}
