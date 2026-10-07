"use server";

import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { invokeRpc } from "@/lib/integrations/supabase/rpc";
import {
  isLikelyBarcodeToken,
  searchActiveGoodsProducts,
} from "@/lib/erp/server/product-catalog-query";
import { buildIlikePattern } from "@/lib/postgrest-search";

export interface BillingVariantSearchResult {
  variantId: string;
  productName: string;
  variantName: string | null;
  price: number;
  stock: number;
}

const VARIANT_LIMIT = 20;

/** POS / manual online sales: variant picker with online inventory stock. */
export async function searchBillingVariants(
  query: string,
): Promise<BillingVariantSearchResult[]> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const trimmed = query.trim();

  let productIds: string[] | null = null;

  if (trimmed) {
    if (isLikelyBarcodeToken(trimmed)) {
      const { data: barcodeProduct, error: barcodeError } = await supabase
        .from("products")
        .select("id")
        .eq("is_active", true)
        .eq("item_type", "goods")
        .eq("barcode", trimmed)
        .limit(1)
        .maybeSingle();
      if (barcodeError) throw new Error(barcodeError.message);
      if (barcodeProduct?.id) {
        productIds = [barcodeProduct.id];
      }
    }

    if (!productIds) {
      const products = await searchActiveGoodsProducts(supabase, trimmed, VARIANT_LIMIT);
      productIds = products.map((p) => p.id);
      if (productIds.length === 0) return [];
    }
  }

  let variantQuery = supabase
    .from("product_variants")
    .select("id, name, price, product_id, products(name)")
    .limit(VARIANT_LIMIT);

  if (productIds) {
    variantQuery = variantQuery.in("product_id", productIds);
  } else if (trimmed) {
    const pattern = buildIlikePattern(trimmed);
    if (pattern) {
      variantQuery = variantQuery.ilike("name", pattern);
    }
  }

  const { data: variants, error } = await variantQuery;
  if (error) throw new Error(error.message);

  const matched = (variants ?? []).slice(0, VARIANT_LIMIT).map((v) => {
    const product = v.products as { name?: string | null } | null;
    return {
      id: v.id,
      pName: product?.name ?? "",
      vName: v.name ?? "",
      price: Number(v.price ?? 0),
    };
  });

  const variantIds = matched.map((m) => m.id);
  const stockByVariant = new Map<string, number>();
  if (variantIds.length > 0) {
    const { data: stockRows, error: stockErr } = await invokeRpc(
      supabase,
      "get_variants_online_available",
      { p_variant_ids: variantIds },
    );
    if (!stockErr) {
      for (const row of (stockRows ?? []) as { variant_id: string; available: number }[]) {
        stockByVariant.set(
          row.variant_id,
          Math.max(0, Math.floor(Number(row.available ?? 0))),
        );
      }
    }
  }

  return matched.map((m) => ({
    variantId: m.id,
    productName: m.pName,
    variantName: m.vName || null,
    price: m.price,
    stock: stockByVariant.get(m.id) ?? 0,
  }));
}
