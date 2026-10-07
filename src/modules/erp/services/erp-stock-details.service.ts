import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type { StockDetailRow } from "@/common/erp/inventory-types";
import { resolveErpStoreId } from "@/modules/erp/services/store-context.service";

/** Per-store physical stock (product-level) + online variant stock summary. */
export async function getStockDetails(input?: {
  storeId?: string;
  page?: number;
  limit?: number;
}): Promise<{ data: StockDetailRow[]; total: number }> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const storeId = await resolveErpStoreId(input?.storeId);
  if (!storeId) {
    return { data: [], total: 0 };
  }
  const page = input?.page ?? 0;
  const limit = input?.limit ?? 50;
  const from = page * limit;

  const { data: spiRows, error, count } = await supabase
    .from("store_product_inventory")
    .select("product_id, stock, purchase_price, sales_price", { count: "exact" })
    .eq("store_id", storeId)
    .order("updated_at", { ascending: false })
    .range(from, from + limit - 1);

  if (error) throw new Error(error.message);

  const productIds = (spiRows ?? []).map((r) => r.product_id);
  const productMap = new Map<string, {
    name: string | null;
    barcode: string | null;
    price: number | null;
    purchase_price: number | null;
  }>();
  const onlineStockMap = new Map<string, number>();

  if (productIds.length > 0) {
    const [{ data: products }, { data: variants }] = await Promise.all([
      supabase
        .from("products")
        .select("id, name, barcode, price, purchase_price")
        .in("id", productIds),
      supabase
        .from("product_variants")
        .select("id, product_id")
        .in("product_id", productIds),
    ]);

    for (const p of products ?? []) {
      productMap.set(p.id, {
        name: p.name,
        barcode: p.barcode,
        price: p.price != null ? Number(p.price) : null,
        purchase_price: p.purchase_price != null ? Number(p.purchase_price) : null,
      });
    }

    const variantIds = (variants ?? []).map((v) => v.id);
    const variantToProduct = new Map(
      (variants ?? []).map((v) => [v.id, v.product_id]),
    );

    if (variantIds.length > 0) {
      const { data: onlineRows } = await supabase
        .from("inventory")
        .select("variant_id, stock")
        .eq("store_id", storeId)
        .in("variant_id", variantIds);

      for (const row of onlineRows ?? []) {
        const productId = variantToProduct.get(row.variant_id);
        if (!productId) continue;
        onlineStockMap.set(
          productId,
          (onlineStockMap.get(productId) ?? 0) + Number(row.stock ?? 0),
        );
      }
    }
  }

  const data: StockDetailRow[] = (spiRows ?? []).map((row) => {
    const product = productMap.get(row.product_id);
    return {
      product_id: row.product_id,
      variant_id: null,
      product_name: product?.name ?? "—",
      variant_name: null,
      central_stock: onlineStockMap.get(row.product_id) ?? 0,
      store_stock: Number(row.stock ?? 0),
      purchase_price:
        row.purchase_price != null
          ? Number(row.purchase_price)
          : product?.purchase_price ?? null,
      sales_price:
        row.sales_price != null ? Number(row.sales_price) : product?.price ?? null,
      barcode: product?.barcode ?? null,
    };
  });

  return { data, total: count ?? 0 };
}

export async function getStoreStockForProduct(
  storeId: string,
  productId: string,
): Promise<number> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("store_product_inventory")
    .select("stock")
    .eq("store_id", storeId)
    .eq("product_id", productId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return Math.max(0, Math.floor(Number(data?.stock ?? 0)));
}

/** @deprecated Use getStoreStockForProduct */
export async function getStoreStockForVariant(
  storeId: string,
  variantId: string,
): Promise<number> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data: variant } = await supabase
    .from("product_variants")
    .select("product_id")
    .eq("id", variantId)
    .maybeSingle();

  if (!variant?.product_id) return 0;
  return getStoreStockForProduct(storeId, variant.product_id);
}
