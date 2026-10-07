import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/integrations/supabase/types";
import { buildIlikePattern, buildPrefixIlikePattern } from "@/lib/postgrest-search";

export type ActiveProductSearchRow = {
  id: string;
  name: string | null;
  barcode: string | null;
  price: number | null;
  purchase_price: number | null;
  tax_rate_percent: number | null;
  available_stock?: number;
  sales_price?: number | null;
};

const PRODUCT_SELECT =
  "id, name, barcode, price, purchase_price, tax_rate_percent" as const;

type CatalogRpcRow = {
  id: string;
  name: string | null;
  barcode: string | null;
  price: number | null;
  purchase_price: number | null;
  tax_rate_percent: number | null;
  available_stock: number | null;
  sales_price: number | null;
};

/** Prefer exact barcode match when the query looks like a SKU/barcode token. */
export function isLikelyBarcodeToken(query: string): boolean {
  const trimmed = query.trim();
  return trimmed.length >= 2 && /^[A-Za-z0-9-]+$/.test(trimmed);
}

function mapRpcRow(row: CatalogRpcRow): ActiveProductSearchRow {
  return {
    id: row.id,
    name: row.name,
    barcode: row.barcode,
    price: row.price,
    purchase_price: row.purchase_price,
    tax_rate_percent: row.tax_rate_percent,
    available_stock: Number(row.available_stock ?? 0),
    sales_price: row.sales_price != null ? Number(row.sales_price) : null,
  };
}

/**
 * One-round-trip catalog search (barcode → prefix → substring).
 * Falls back to PostgREST if the RPC is not applied yet.
 */
export async function searchActiveGoodsProducts(
  supabase: SupabaseClient<Database>,
  query: string,
  limit = 25,
  storeId?: string,
): Promise<ActiveProductSearchRow[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const { data: rpcRows, error: rpcError } = await supabase.rpc(
    "erp_search_catalog_products" as never,
    {
      p_query: trimmed,
      p_store_id: storeId ?? null,
      p_limit: limit,
    } as never,
  );

  if (!rpcError && Array.isArray(rpcRows)) {
    return (rpcRows as CatalogRpcRow[]).map(mapRpcRow);
  }

  if (rpcError && process.env.NODE_ENV === "development") {
    console.warn(
      "[catalog-search] erp_search_catalog_products RPC failed; using PostgREST fallback:",
      rpcError.message,
    );
  }

  return searchActiveGoodsProductsViaPostgrest(supabase, trimmed, limit);
}

async function searchActiveGoodsProductsViaPostgrest(
  supabase: SupabaseClient<Database>,
  trimmed: string,
  limit: number,
): Promise<ActiveProductSearchRow[]> {
  const base = () =>
    supabase
      .from("products")
      .select(PRODUCT_SELECT)
      .eq("is_active", true)
      .eq("item_type", "goods");

  if (isLikelyBarcodeToken(trimmed)) {
    const { data: exactRows, error: exactError } = await base()
      .eq("barcode", trimmed)
      .limit(limit);
    if (exactError) throw new Error(exactError.message);
    if (exactRows?.length) {
      return exactRows as ActiveProductSearchRow[];
    }
  }

  const prefix = buildPrefixIlikePattern(trimmed);
  if (prefix) {
    const { data: prefixRows, error: prefixError } = await base()
      .or(`name.ilike.${prefix},barcode.ilike.${prefix}`)
      .order("name", { ascending: true })
      .limit(limit);
    if (prefixError) throw new Error(prefixError.message);
    if (prefixRows?.length) {
      return prefixRows as ActiveProductSearchRow[];
    }
  }

  const pattern = buildIlikePattern(trimmed);
  if (!pattern) return [];

  const { data, error } = await base()
    .or(`name.ilike.${pattern},barcode.ilike.${pattern}`)
    .order("name", { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as ActiveProductSearchRow[];
}
