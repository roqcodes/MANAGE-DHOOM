import "server-only";

import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  buildPosOrderItemSnapshots,
  type OrderItemSnapshot,
} from "@/modules/orders/services/order-item-pricing.service";
import {
  computeOrderMargin,
  resolveListPrice,
} from "@/modules/pricing/pricing.resolver";
import { requireErpStoreId } from "@/modules/erp/services/store-context.service";
import { mapPosCheckoutUserMessage } from "@/modules/orders/services/pos-checkout-errors";
import { logPosCheckoutCommitted } from "@/modules/orders/services/pos-post-checkout.service";
import { derivePosCheckoutHeaderTotals } from "@/modules/orders/services/pos-checkout-totals.service";
import type { Json } from "@/lib/integrations/supabase/types";

function resolvePosCartLinePrice(
  snapshot: OrderItemSnapshot,
  unitPriceOverride?: number,
): number {
  if (unitPriceOverride != null && Number.isFinite(unitPriceOverride)) {
    return resolveListPrice(unitPriceOverride);
  }
  return snapshot.final_price;
}

export interface CreateManualOrderInput {
  userId?: string;
  customerName?: string;
  phone?: string;
  company?: string;
  gstNumber?: string;
  subtotal: number;
  tax: number;
  discount: number;
  totalAmount: number;
  items: {
    variantId: string;
    quantity: number;
    unitPrice?: number;
  }[];
  /** Client-generated UUID; same key on safe retries prevents duplicate sales. */
  idempotencyKey?: string;
}

export interface CreateManualOrderResult {
  orderId: string;
  orderNumber: string;
  totalAmount: number;
  itemCount: number;
  /** True when the same idempotency key was replayed (no duplicate sale). */
  idempotentReplay: boolean;
}

/** Admin POS counter sale — one atomic database transaction via `complete_pos_counter_sale`. */
export async function createManualOrder(
  input: CreateManualOrderInput,
): Promise<CreateManualOrderResult> {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) throw new Error("Unauthorized");
  const supabase = await createSupabaseServerClient();
  const storeId = await requireErpStoreId();

  if (!input.items || input.items.length === 0) {
    throw new Error("Cannot create a sale with no items");
  }

  if (!input.idempotencyKey) {
    throw new Error(
      mapPosCheckoutUserMessage(new Error("POS_CHECKOUT_INVALID: idempotency key is required")),
    );
  }
  const idempotencyKey = input.idempotencyKey;

  const qtyByVariant = new Map<string, number>();
  for (const item of input.items) {
    qtyByVariant.set(
      item.variantId,
      (qtyByVariant.get(item.variantId) ?? 0) + item.quantity,
    );
  }
  const snapshots = await buildPosOrderItemSnapshots(
    storeId,
    [...qtyByVariant.entries()].map(([variantId, quantity]) => ({
      variantId,
      quantity,
      unitPriceOverride: input.items.find((i) => i.variantId === variantId)?.unitPrice,
    })),
  );

  const rpcLines: Json = [];
  let itemCount = 0;

  for (const item of input.items) {
    const snapshot = snapshots.get(item.variantId);
    if (!snapshot) throw new Error("Variant or product not found.");

    itemCount += item.quantity;

    const finalPrice = resolvePosCartLinePrice(snapshot, item.unitPrice);

    (rpcLines as unknown[]).push({
      variant_id: item.variantId,
      product_id: snapshot.product_id,
      quantity: item.quantity,
      unit_price: finalPrice,
      final_price: finalPrice,
      base_price: snapshot.base_price,
      margin_amount: computeOrderMargin(finalPrice, snapshot.base_price),
      vendor_id: snapshot.vendor_id,
      product_name: snapshot.product_name,
    });
  }

  const pricedLines = (rpcLines as unknown as {
    final_price: number;
    quantity: number;
  }[]).map((line) => ({
    finalPrice: line.final_price,
    quantity: line.quantity,
  }));

  const headerTotals = derivePosCheckoutHeaderTotals(
    pricedLines,
    input.tax,
    input.discount,
  );

  const { data, error } = await supabase.rpc("complete_pos_counter_sale", {
    p_idempotency_key: idempotencyKey,
    p_store_id: storeId,
    p_lines: rpcLines,
    p_subtotal: headerTotals.subtotal,
    p_tax: headerTotals.tax,
    p_discount: headerTotals.discount,
    p_total_amount: headerTotals.totalAmount,
    p_customer_user_id: input.userId ?? undefined,
    p_customer_name: input.customerName ?? undefined,
    p_phone: input.phone ?? undefined,
    p_company: input.company ?? undefined,
    p_gst_number: input.gstNumber ?? undefined,
    p_created_by: auth.profile.id,
  });

  if (error) {
    throw new Error(mapPosCheckoutUserMessage(error));
  }

  const payload = data as {
    order_id?: string;
    total_amount?: number;
    item_count?: number;
    idempotent_replay?: boolean;
  } | null;

  const orderId = payload?.order_id;
  if (!orderId) {
    throw new Error(mapPosCheckoutUserMessage(new Error("POS_CHECKOUT_INVALID: missing order")));
  }

  const idempotentReplay = Boolean(payload?.idempotent_replay);

  logPosCheckoutCommitted({
    orderId,
    storeId,
    actorId: auth.profile.id,
    idempotentReplay,
  });

  return {
    orderId,
    orderNumber: orderId.slice(0, 8).toUpperCase(),
    totalAmount: Number(payload?.total_amount ?? input.totalAmount),
    itemCount: Number(payload?.item_count ?? itemCount),
    idempotentReplay,
  };
}
