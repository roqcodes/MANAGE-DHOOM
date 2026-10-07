import "server-only";

import {
  requireAdminOnlyProfile,
  requireAdminOrManagerProfile,
} from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import {
  deleteInventoryRowForVariant,
  insertInventoryRow,
} from "@/modules/inventory/services/inventory.service";
import {
  deleteVendorProductsForVariant,
} from "@/modules/products/services/vendor-products-cleanup.service";

export async function insertVariantWithInventory(input: {
  productId: string;
  name: string;
  price: number;
  mrp: number;
  stock?: number;
  variantGroupId?: string | null;
  barcode?: string | null;
  productCode?: string | null;
  purchasePrice?: number | null;
  taxRatePercent?: number | null;
  unitId?: string | null;
  markupPercent?: number | null;
}): Promise<string> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data: row, error: insErr } = await supabase
    .from("product_variants")
    .insert({
      product_id: input.productId,
      name: input.name,
      price: input.price,
      mrp: input.mrp,
      variant_group_id: input.variantGroupId ?? null,
      barcode: input.barcode ?? null,
      product_code: input.productCode ?? null,
      purchase_price: input.purchasePrice ?? null,
      tax_rate_percent: input.taxRatePercent ?? null,
      unit_id: input.unitId ?? null,
      markup_percent: input.markupPercent ?? null,
    })
    .select("id")
    .single();

  if (insErr) throw new Error(insErr.message);
  if (!row?.id) throw new Error("Variant insert failed.");

  try {
    const stock =
      input.stock != null ? Math.max(0, Math.floor(input.stock)) : 0;
    await insertInventoryRow(row.id, stock);
  } catch (e) {
    await supabase.from("product_variants").delete().eq("id", row.id);
    throw e instanceof Error ? e : new Error(String(e));
  }

  return row.id;
}

export async function updateVariantById(
  id: string,
  input: {
    name: string;
    price: number;
    mrp: number;
    barcode?: string | null;
    productCode?: string | null;
    purchasePrice?: number | null;
    taxRatePercent?: number | null;
    unitId?: string | null;
    markupPercent?: number | null;
  },
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("product_variants")
    .update({
      name: input.name,
      price: input.price,
      mrp: input.mrp,
      barcode: input.barcode ?? null,
      product_code: input.productCode ?? null,
      purchase_price: input.purchasePrice ?? null,
      tax_rate_percent: input.taxRatePercent ?? null,
      unit_id: input.unitId ?? null,
      markup_percent: input.markupPercent ?? null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Removes vendor_products, inventory, list overrides, and shopping-list rows for this variant, then the variant row.
 */
export async function deleteVariantAndSupplyRows(
  variantId: string,
): Promise<void> {
  await requireAdminOnlyProfile();
  await assertVariantsNotLinkedToOrdersOrPurchaseOrders([variantId]);
  await deleteVariantSupplyRowsWithoutLinkCheck(variantId);
}

export async function assertVariantsNotLinkedToOrdersOrPurchaseOrders(
  variantIds: string[],
): Promise<void> {
  if (variantIds.length === 0) return;

  const supabase = await createSupabaseServerClient();

  const { count: orderCount, error: orderErr } = await supabase
    .from("order_items")
    .select("id", { count: "exact", head: true })
    .in("variant_id", variantIds);
  if (orderErr) throw new Error(orderErr.message);
  if ((orderCount ?? 0) > 0) {
    const message =
      variantIds.length === 1
        ? "Cannot delete: this variant appears on one or more orders."
        : "Cannot delete product: one or more variants appear on customer orders.";
    throw new Error(message);
  }

  const { count: poCount, error: poErr } = await supabase
    .from("purchase_order_items")
    .select("id", { count: "exact", head: true })
    .in("variant_id", variantIds);
  if (poErr) throw new Error(poErr.message);
  if ((poCount ?? 0) > 0) {
    const message =
      variantIds.length === 1
        ? "Cannot delete: this variant appears on one or more purchase orders."
        : "Cannot delete product: one or more variants appear on purchase orders.";
    throw new Error(message);
  }
}

export async function deleteVariantSupplyRowsWithoutLinkCheck(
  variantId: string,
): Promise<void> {
  await deleteVendorProductsForVariant(variantId);
  await deleteInventoryRowForVariant(variantId);

  const supabase = await createSupabaseServerClient();
  const { error: listErr } = await supabase
    .from("shopping_list_items")
    .delete()
    .eq("variant_id", variantId);
  if (listErr) throw new Error(listErr.message);

  const { error: overrideErr } = await supabase
    .from("vendor_pricing_overrides")
    .delete()
    .eq("variant_id", variantId);
  if (overrideErr) throw new Error(overrideErr.message);

  const { error } = await supabase
    .from("product_variants")
    .delete()
    .eq("id", variantId);
  if (error) throw new Error(error.message);
}
