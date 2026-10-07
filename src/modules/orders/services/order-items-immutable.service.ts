import "server-only";

import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type { Database } from "@/lib/integrations/supabase/types";

export type OrderItemMutableUpdate =
  Database["public"]["Tables"]["order_items"]["Update"];

/** Columns written at order_items insert and never mutated. */
export const ORDER_ITEM_SNAPSHOT_COLUMNS = [
  "vendor_id",
  "base_price",
  "final_price",
  "margin_amount",
  "price",
  "product_name",
] as const;

export interface OrderItemSnapshotInsert {
  vendor_id: string | null;
  base_price: number;
  final_price: number;
  margin_amount: number;
  price: number;
  product_name: string;
}

/**
 * Validates snapshot fields before insert. All must be non-null and finite numbers where applicable.
 */
export function assertCompleteOrderItemSnapshotForInsert(
  row: Partial<OrderItemSnapshotInsert> & { unit_price?: number },
): asserts row is OrderItemSnapshotInsert {
  if (row.vendor_id != null && String(row.vendor_id).trim() === "") {
    throw new Error("order_items: vendor_id must be null or a non-empty id.");
  }
  if (row.product_name == null || String(row.product_name).trim() === "") {
    throw new Error("order_items: product_name is required for snapshot.");
  }
  for (const key of ["base_price", "final_price", "margin_amount", "price"] as const) {
    const v = row[key];
    if (v == null || !Number.isFinite(Number(v))) {
      throw new Error(`order_items: snapshot field "${key}" must be a finite number.`);
    }
  }
}

/**
 * Call before any `order_items` update. Blocks changes to snapshot columns so
 * historical pricing stays fixed after order creation.
 */
export function assertOrderItemUpdatePreservesSnapshots(patch: object): void {
  for (const key of ORDER_ITEM_SNAPSHOT_COLUMNS) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      throw new Error(
        `order_items: immutable snapshot field "${key}" cannot be updated.`,
      );
    }
  }
}

/**
 * Single entry point for mutating order_items rows (besides insert). Rejects snapshot field changes.
 */
export async function updateOrderItemRow(
  id: string,
  patch: OrderItemMutableUpdate,
): Promise<void> {
  assertOrderItemUpdatePreservesSnapshots(patch);
  if (Object.keys(patch).length === 0) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("order_items").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}
