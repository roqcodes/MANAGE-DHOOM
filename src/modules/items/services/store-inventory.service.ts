import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { invokeRpc } from "@/lib/integrations/supabase/rpc";

export interface StoreInventoryRow {
  store_id: string;
  variant_id: string;
  stock: number;
  purchase_price: number | null;
  sales_price: number | null;
  opening_stock: number;
  stores: { id: string; name: string } | null;
}

/** Physical stock is product-level; returns product stock per store for the variant's product. */
export async function listStoreInventoryForVariant(
  variantId: string,
): Promise<StoreInventoryRow[]> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data: variant, error: variantError } = await supabase
    .from("product_variants")
    .select("id, product_id")
    .eq("id", variantId)
    .maybeSingle();
  if (variantError) throw new Error(variantError.message);
  if (!variant?.product_id) return [];

  const { data, error } = await supabase
    .from("store_product_inventory")
    .select("store_id, product_id, stock, purchase_price, sales_price, opening_stock")
    .eq("product_id", variant.product_id);
  if (error) throw new Error(error.message);

  const storeIds = [...new Set((data ?? []).map((row) => row.store_id))];
  const storeMap = new Map<string, { id: string; name: string }>();
  if (storeIds.length > 0) {
    const { data: stores } = await supabase
      .from("stores")
      .select("id, name")
      .in("id", storeIds);
    for (const store of stores ?? []) {
      storeMap.set(store.id, { id: store.id, name: store.name });
    }
  }

  return (data ?? []).map((row) => ({
    store_id: row.store_id,
    variant_id: variantId,
    stock: Number(row.stock ?? 0),
    purchase_price: row.purchase_price != null ? Number(row.purchase_price) : null,
    sales_price: row.sales_price != null ? Number(row.sales_price) : null,
    opening_stock: Number(row.opening_stock ?? 0),
    stores: storeMap.get(row.store_id) ?? null,
  }));
}

export async function upsertStoreInventoryRow(input: {
  storeId: string;
  variantId: string;
  stock?: number;
  purchasePrice?: number | null;
  salesPrice?: number | null;
  openingStock?: number;
}): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data: variant, error: variantError } = await supabase
    .from("product_variants")
    .select("product_id")
    .eq("id", input.variantId)
    .maybeSingle();
  if (variantError) throw new Error(variantError.message);
  if (!variant?.product_id) throw new Error("Variant not found");

  if (input.stock !== undefined) {
    const { error: stockErr } = await invokeRpc(supabase, "set_store_product_inventory_stock", {
      p_store_id: input.storeId,
      p_product_id: variant.product_id,
      p_stock: input.stock,
    });
    if (stockErr) throw new Error(stockErr.message);
  }

  const pricePatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.purchasePrice !== undefined) pricePatch.purchase_price = input.purchasePrice;
  if (input.salesPrice !== undefined) pricePatch.sales_price = input.salesPrice;
  if (input.openingStock !== undefined) pricePatch.opening_stock = input.openingStock;

  if (Object.keys(pricePatch).length > 1) {
    const { error } = await supabase.from("store_product_inventory").upsert({
      store_id: input.storeId,
      product_id: variant.product_id,
      stock: input.stock ?? 0,
      ...pricePatch,
    });
    if (error) throw new Error(error.message);
  }
}
