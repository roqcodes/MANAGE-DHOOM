import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { insertVariantWithInventory } from "@/modules/products/services/product-variants.service";

const DEFAULT_SKU_NAME = "Default";

export type ProductVariantAllocationRow = {
  id: string;
  name: string | null;
};

/** Ensure a simple product has one sellable SKU (variant) for online inventory flows. */
export async function ensureDefaultProductVariant(
  productId: string,
): Promise<string> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data: existing, error: existingErr } = await supabase
    .from("product_variants")
    .select("id")
    .eq("product_id", productId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingErr) throw new Error(existingErr.message);
  if (existing?.id) return existing.id;

  const { data: rpcId, error: rpcError } = await supabase.rpc(
    "ensure_product_default_variant",
    { p_product_id: productId },
  );
  if (!rpcError && rpcId) return rpcId as string;

  const { data: product, error: productErr } = await supabase
    .from("products")
    .select("id, name, price, mrp, barcode, purchase_price, tax_rate_percent")
    .eq("id", productId)
    .single();

  if (productErr || !product) {
    throw new Error(productErr?.message ?? "Product not found");
  }

  const listPrice =
    Number(product.price) ||
    Number(product.mrp) ||
    Number(product.purchase_price) ||
    0;

  const variantId = await insertVariantWithInventory({
    productId: product.id,
    name: product.name?.trim() || DEFAULT_SKU_NAME,
    price: listPrice,
    mrp: Number(product.mrp) || listPrice,
    stock: 0,
    barcode: product.barcode ?? null,
    purchasePrice: product.purchase_price ?? null,
    taxRatePercent: product.tax_rate_percent ?? null,
  });

  return variantId;
}

/** List variants for store → online allocation; creates a default SKU when missing. */
export async function listProductVariantsForAllocation(
  productId: string,
  ensureDefault = true,
): Promise<ProductVariantAllocationRow[]> {
  await requireAdminOrManagerProfile();

  let ensuredId: string | null = null;
  if (ensureDefault) {
    ensuredId = await ensureDefaultProductVariant(productId);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("product_variants")
    .select("id, name")
    .eq("product_id", productId)
    .order("name");

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as ProductVariantAllocationRow[];
  if (rows.length > 0) return rows;

  if (ensuredId) {
    const { data: row, error: rowErr } = await supabase
      .from("product_variants")
      .select("id, name")
      .eq("id", ensuredId)
      .maybeSingle();

    if (rowErr) throw new Error(rowErr.message);
    if (row) return [row as ProductVariantAllocationRow];

    const { data: product } = await supabase
      .from("products")
      .select("name")
      .eq("id", productId)
      .maybeSingle();

    return [
      {
        id: ensuredId,
        name: product?.name?.trim() || DEFAULT_SKU_NAME,
      },
    ];
  }

  return [];
}
