import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type { ErpSalesProductSearchRow } from "@/common/erp/sales-types";
import { getAdminErpContext } from "@/modules/erp/services/store-context.service";
import { searchActiveGoodsProducts } from "@/lib/erp/server/product-catalog-query";
import { buildIlikePattern } from "@/lib/postgrest-search";

async function loadStoreProductStockMap(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  storeId: string | undefined,
  productIds: string[],
): Promise<Map<string, { stock: number; sales_price: number | null }>> {
  const stockMap = new Map<string, { stock: number; sales_price: number | null }>();
  if (!storeId || productIds.length === 0) return stockMap;

  const { data: rows } = await supabase
    .from("store_product_inventory")
    .select("product_id, stock, sales_price")
    .eq("store_id", storeId)
    .in("product_id", productIds);

  for (const row of rows ?? []) {
    stockMap.set(row.product_id, {
      stock: Number(row.stock ?? 0),
      sales_price: row.sales_price != null ? Number(row.sales_price) : null,
    });
  }

  return stockMap;
}

function mapProductRow(
  row: {
    id: string;
    name: string | null;
    barcode: string | null;
    price: number | null;
    purchase_price: number | null;
    tax_rate_percent: number | null;
  },
  storeStockMap: Map<string, { stock: number; sales_price: number | null }>,
): ErpSalesProductSearchRow {
  const si = storeStockMap.get(row.id);
  return {
    id: row.id,
    product_name: row.name ?? "Product",
    barcode: row.barcode,
    sales_price: si?.sales_price ?? (row.price != null ? Number(row.price) : null),
    purchase_price: row.purchase_price != null ? Number(row.purchase_price) : null,
    tax_rate_percent: row.tax_rate_percent != null ? Number(row.tax_rate_percent) : null,
    available_stock: si?.stock ?? 0,
  };
}

/** ERP sales catalog: product-level (no variants). */
export async function searchSalesProducts(
  query: string,
  storeId?: string,
  limit = 25,
): Promise<ErpSalesProductSearchRow[]> {
  const supabase = await createSupabaseServerClient();
  const activeStoreId = storeId ?? undefined;

  const rows = await searchActiveGoodsProducts(supabase, query, limit, activeStoreId);

  if (rows.some((row) => row.available_stock != null)) {
    return rows.map((row) => ({
      id: row.id,
      product_name: row.name ?? "Product",
      barcode: row.barcode,
      sales_price:
        row.sales_price ?? (row.price != null ? Number(row.price) : null),
      purchase_price: row.purchase_price != null ? Number(row.purchase_price) : null,
      tax_rate_percent: row.tax_rate_percent != null ? Number(row.tax_rate_percent) : null,
      available_stock: Number(row.available_stock ?? 0),
    }));
  }

  const storeStockMap = await loadStoreProductStockMap(
    supabase,
    activeStoreId,
    rows.map((row) => row.id),
  );

  return rows.map((row) =>
    mapProductRow(
      {
        id: row.id,
        name: row.name,
        barcode: row.barcode,
        price: row.price,
        purchase_price: row.purchase_price,
        tax_rate_percent: row.tax_rate_percent,
      },
      storeStockMap,
    ),
  );
}

export type TransferCatalogStockFilter = "all" | "in_stock" | "out_of_stock";
export type TransferCatalogSort = "name" | "stock_desc" | "stock_asc";

/** Browse products for store → online transfer (supports empty search + filters). */
export async function listSalesProductsForTransfer(options: {
  storeId?: string;
  query?: string;
  stockFilter?: TransferCatalogStockFilter;
  sort?: TransferCatalogSort;
  page?: number;
  limit?: number;
}): Promise<{ data: ErpSalesProductSearchRow[]; total: number }> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const ctx = await getAdminErpContext();
  const activeStoreId = options.storeId ?? ctx?.store_id ?? undefined;
  if (!activeStoreId) return { data: [], total: 0 };

  const page = options.page ?? 0;
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const from = page * limit;
  const stockFilter = options.stockFilter ?? "in_stock";
  const sort = options.sort ?? "name";
  const pattern = buildIlikePattern(options.query ?? "");

  if (stockFilter === "all") {
    let pq = supabase
      .from("products")
      .select(
        "id, name, barcode, price, purchase_price, tax_rate_percent",
        { count: "exact" },
      )
      .eq("is_active", true)
      .eq("item_type", "goods");

    if (pattern) {
      pq = pq.or(`name.ilike.${pattern},barcode.ilike.${pattern}`);
    }
    if (sort === "name") {
      pq = pq.order("name", { ascending: true });
    }

    const { data, error, count } = await pq.range(from, from + limit - 1);
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as {
      id: string;
      name: string | null;
      barcode: string | null;
      price: number | null;
      purchase_price: number | null;
      tax_rate_percent: number | null;
    }[];

    const storeStockMap = await loadStoreProductStockMap(
      supabase,
      activeStoreId,
      rows.map((row) => row.id),
    );

    let mapped = rows.map((row) => mapProductRow(row, storeStockMap));
    if (sort === "stock_desc") {
      mapped = mapped.sort((a, b) => b.available_stock - a.available_stock);
    } else if (sort === "stock_asc") {
      mapped = mapped.sort((a, b) => a.available_stock - b.available_stock);
    }

    return { data: mapped, total: count ?? 0 };
  }

  let sq = supabase
    .from("store_product_inventory")
    .select("stock, sales_price, product_id", { count: "exact" })
    .eq("store_id", activeStoreId);

  if (stockFilter === "in_stock") {
    sq = sq.gt("stock", 0);
  } else {
    sq = sq.eq("stock", 0);
  }

  if (pattern) {
    const { data: matchingProducts, error: matchError } = await supabase
      .from("products")
      .select("id")
      .eq("is_active", true)
      .eq("item_type", "goods")
      .or(`name.ilike.${pattern},barcode.ilike.${pattern}`);
    if (matchError) throw new Error(matchError.message);
    const matchingIds = (matchingProducts ?? []).map((row) => row.id);
    if (matchingIds.length === 0) return { data: [], total: 0 };
    sq = sq.in("product_id", matchingIds);
  }

  if (sort === "stock_desc") {
    sq = sq.order("stock", { ascending: false });
  } else if (sort === "stock_asc") {
    sq = sq.order("stock", { ascending: true });
  }

  const { data: stockRows, error, count } = await sq.range(from, from + limit - 1);
  if (error) throw new Error(error.message);

  const productIds = (stockRows ?? []).map((row) => row.product_id);
  if (productIds.length === 0) {
    return { data: [], total: count ?? 0 };
  }

  let pq = supabase
    .from("products")
    .select("id, name, barcode, price, purchase_price, tax_rate_percent")
    .in("id", productIds)
    .eq("is_active", true)
    .eq("item_type", "goods");

  const { data: productRows, error: productError } = await pq;
  if (productError) throw new Error(productError.message);

  const productMap = new Map(
    (productRows ?? []).map((row) => [row.id, row]),
  );

  const stockByProduct = new Map(
    (stockRows ?? []).map((row) => [
      row.product_id,
      {
        stock: Number(row.stock ?? 0),
        sales_price: row.sales_price != null ? Number(row.sales_price) : null,
      },
    ]),
  );

  let mapped = productIds
    .map((productId) => {
      const product = productMap.get(productId);
      if (!product) return null;
      const stockMap = new Map<string, { stock: number; sales_price: number | null }>();
      const stockEntry = stockByProduct.get(productId);
      if (stockEntry) stockMap.set(productId, stockEntry);
      return mapProductRow(
        product as {
          id: string;
          name: string | null;
          barcode: string | null;
          price: number | null;
          purchase_price: number | null;
          tax_rate_percent: number | null;
        },
        stockMap,
      );
    })
    .filter((row): row is ErpSalesProductSearchRow => row != null);

  if (sort === "name") {
    mapped = mapped.sort((a, b) => a.product_name.localeCompare(b.product_name));
  } else if (sort === "stock_desc") {
    mapped = mapped.sort((a, b) => b.available_stock - a.available_stock);
  } else if (sort === "stock_asc") {
    mapped = mapped.sort((a, b) => a.available_stock - b.available_stock);
  }

  return { data: mapped, total: count ?? 0 };
}

/** @deprecated Use searchSalesProducts — kept for route compatibility */
export async function searchSalesVariants(
  query: string,
  storeId?: string,
  limit = 25,
): Promise<ErpSalesProductSearchRow[]> {
  return searchSalesProducts(query, storeId, limit);
}
