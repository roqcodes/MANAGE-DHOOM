import "server-only";

import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type { ErpProductSearchRow } from "@/common/erp/purchasing-types";
import { roundMoney } from "@/common/erp/purchasing-types";
import { searchActiveGoodsProducts } from "@/lib/erp/server/product-catalog-query";

/** ERP purchasing catalog: product-level (no variants). */
export async function searchPurchaseProducts(
  query: string,
  limit = 25,
  storeId?: string,
): Promise<ErpProductSearchRow[]> {
  const supabase = await createSupabaseServerClient();
  const rows = await searchActiveGoodsProducts(supabase, query, limit, storeId);

  return rows.map((row) => ({
    id: row.id,
    product_name: row.name ?? "Product",
    barcode: row.barcode,
    purchase_price:
      row.purchase_price != null ? roundMoney(Number(row.purchase_price)) : null,
    tax_rate_percent: row.tax_rate_percent != null ? Number(row.tax_rate_percent) : null,
    available_stock: Number(row.available_stock ?? 0),
  }));
}

/** @deprecated Use searchPurchaseProducts */
export async function searchPurchaseVariants(
  query: string,
  limit = 25,
  storeId?: string,
): Promise<ErpProductSearchRow[]> {
  return searchPurchaseProducts(query, limit, storeId);
}
