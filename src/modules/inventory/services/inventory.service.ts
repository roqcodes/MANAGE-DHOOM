import "server-only";

import {
  requireAdminOnlyProfile,
  requireAdminOrManagerProfile,
} from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { invokeRpc } from "@/lib/integrations/supabase/rpc";
import type {
  InventoryCatalogStats,
  InventoryWithVariant,
  Paginated,
} from "@/common/admin/types";
import type { OnlineVariantTransferRow } from "@/common/erp/sales-types";
import { PAGE_SIZE } from "@/common/admin/types";
import { DEFAULT_REORDER_POINT } from "@/modules/inventory/components/inventory-ui";
import { getAdminErpContext } from "@/modules/erp/services/store-context.service";
import { buildIlikePattern } from "@/lib/postgrest-search";

export type OnlineTransferCatalogStockFilter = "all" | "in_stock" | "out_of_stock";
export type OnlineTransferCatalogSort = "name" | "stock_desc" | "stock_asc";

/** Online / central inventory per store (variant-level). */
export async function getInventory(
  page = 0,
  storeId?: string,
): Promise<Paginated<InventoryWithVariant>> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const from = page * PAGE_SIZE;

  let query = supabase
    .from("inventory")
    .select(
      "store_id,variant_id,stock,reserved_stock,reorder_point,last_reorder_quantity,updated_at,product_variants(id,name,products(id,name),variant_images(url,is_preview,sort_order)),stores(name)",
      { count: "exact" },
    )
    .order("updated_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (storeId) query = query.eq("store_id", storeId);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  return {
    data: (data ?? []) as unknown as InventoryWithVariant[],
    total: count ?? 0,
  };
}

export async function getInventoryCatalogStats(
  storeId?: string,
): Promise<InventoryCatalogStats> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const rpc = await invokeRpc(supabase, "get_inventory_catalog_stats", {
    p_store_id: storeId ?? null,
  });
  if (!rpc.error && rpc.data && typeof rpc.data === "object") {
    const row = rpc.data as {
      total_skus?: number;
      critical_skus?: number;
      low_stock_skus?: number;
      healthy_skus?: number;
    };
    return {
      totalSkus: Number(row.total_skus ?? 0),
      criticalSkus: Number(row.critical_skus ?? 0),
      lowStockSkus: Number(row.low_stock_skus ?? 0),
      healthySkus: Number(row.healthy_skus ?? 0),
    };
  }

  let query = supabase.from("inventory").select("stock,reorder_point,reserved_stock");
  if (storeId) query = query.eq("store_id", storeId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let criticalSkus = 0;
  let lowStockSkus = 0;
  let healthySkus = 0;

  for (const row of data ?? []) {
    const stock = Math.max(
      0,
      Math.floor(Number(row.stock ?? 0) - Number(row.reserved_stock ?? 0)),
    );
    const reorderPoint = Math.max(
      0,
      Math.floor(Number(row.reorder_point ?? DEFAULT_REORDER_POINT)),
    );
    if (stock < 1) {
      criticalSkus += 1;
    } else if (stock < reorderPoint) {
      lowStockSkus += 1;
    } else {
      healthySkus += 1;
    }
  }

  return {
    totalSkus: (data ?? []).length,
    criticalSkus,
    lowStockSkus,
    healthySkus,
  };
}

/** Browse online variants for Online → Store transfer. */
export async function listOnlineVariantsForTransfer(options: {
  storeId?: string;
  query?: string;
  stockFilter?: OnlineTransferCatalogStockFilter;
  sort?: OnlineTransferCatalogSort;
  page?: number;
  limit?: number;
}): Promise<{ data: OnlineVariantTransferRow[]; total: number }> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const ctx = await getAdminErpContext();
  const activeStoreId = options.storeId ?? ctx?.store_id ?? undefined;
  if (!activeStoreId) return { data: [], total: 0 };

  const page = options.page ?? 0;
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const stockFilter = options.stockFilter ?? "in_stock";
  const sort = options.sort ?? "stock_desc";
  const pattern = buildIlikePattern(options.query ?? "");

  let query = supabase
    .from("inventory")
    .select(
      "variant_id, stock, reserved_stock, product_variants(id, name, products(id, name, barcode))",
      { count: "exact" },
    )
    .eq("store_id", activeStoreId);

  if (pattern) {
    const variantIds = new Set<string>();

    const { data: variantsByName, error: variantError } = await supabase
      .from("product_variants")
      .select("id")
      .ilike("name", pattern);
    if (variantError) throw new Error(variantError.message);
    for (const row of variantsByName ?? []) variantIds.add(row.id);

    const { data: products, error: productError } = await supabase
      .from("products")
      .select("id")
      .or(`name.ilike.${pattern},barcode.ilike.${pattern}`);
    if (productError) throw new Error(productError.message);

    const productIds = (products ?? []).map((row) => row.id);
    if (productIds.length > 0) {
      const { data: variantsByProduct, error: byProductError } = await supabase
        .from("product_variants")
        .select("id")
        .in("product_id", productIds);
      if (byProductError) throw new Error(byProductError.message);
      for (const row of variantsByProduct ?? []) variantIds.add(row.id);
    }

    if (variantIds.size === 0) return { data: [], total: 0 };
    query = query.in("variant_id", [...variantIds]);
  }

  const { data: rows, error, count } = await query.range(0, 9999);
  if (error) throw new Error(error.message);

  type InventoryJoinRow = {
    variant_id: string;
    stock: number | null;
    reserved_stock: number | null;
    product_variants: {
      id: string;
      name: string | null;
      products: {
        id: string;
        name: string | null;
        barcode: string | null;
      } | null;
    } | null;
  };

  let mapped = (rows ?? []).map((row) => {
    const typed = row as InventoryJoinRow;
    const variant = typed.product_variants;
    const product = variant?.products;
    const available = Math.max(
      0,
      Math.floor(Number(typed.stock ?? 0) - Number(typed.reserved_stock ?? 0)),
    );
    return {
      id: typed.variant_id,
      variant_name: variant?.name ?? "Variant",
      product_id: product?.id ?? "",
      product_name: product?.name ?? "Product",
      barcode: product?.barcode ?? null,
      available_stock: available,
    } satisfies OnlineVariantTransferRow;
  });

  if (stockFilter === "in_stock") {
    mapped = mapped.filter((row) => row.available_stock > 0);
  } else if (stockFilter === "out_of_stock") {
    mapped = mapped.filter((row) => row.available_stock <= 0);
  }

  if (sort === "name") {
    mapped.sort((a, b) =>
      `${a.product_name} ${a.variant_name}`.localeCompare(
        `${b.product_name} ${b.variant_name}`,
      ),
    );
  } else if (sort === "stock_desc") {
    mapped.sort((a, b) => b.available_stock - a.available_stock);
  } else if (sort === "stock_asc") {
    mapped.sort((a, b) => a.available_stock - b.available_stock);
  }

  const total = mapped.length;
  const from = page * limit;
  const data = mapped.slice(from, from + limit);

  return { data, total: pattern || stockFilter !== "all" ? total : (count ?? total) };
}

/** Online inventory rows are created via stock transfer allocation only. */
export async function insertInventoryRow(
  _variantId: string,
  _stock = 0,
): Promise<void> {
  return;
}

export async function deleteInventoryRowForVariant(
  variantId: string,
): Promise<void> {
  await requireAdminOnlyProfile();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("inventory")
    .delete()
    .eq("variant_id", variantId);
  if (error) throw new Error(error.message);
}

export async function upsertInventoryStock(
  _variantId: string,
  _stock: number,
): Promise<void> {
  throw new Error(
    "Direct online stock edits are disabled. Use Store → Online or Online → Store transfers.",
  );
}

export async function updateInventoryReorderSettings(
  variantId: string,
  reorder_point: number,
  storeId?: string,
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("inventory")
    .update({ reorder_point: Math.max(0, Math.floor(reorder_point)) })
    .eq("variant_id", variantId);

  if (storeId) query = query.eq("store_id", storeId);

  const { error } = await query;
  if (error) throw new Error(error.message);
}

/**
 * @deprecated PO delivery does not increase stock. Use ERP purchase bill finalize.
 */
export async function incrementCentralInventoryByLines(
  _lines: { variantId: string; quantity: number }[],
): Promise<void> {
  return;
}
