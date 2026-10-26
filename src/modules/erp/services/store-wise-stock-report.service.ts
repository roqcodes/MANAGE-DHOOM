import "server-only";

import { roundMoney } from "@/common/erp/purchasing-types";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { listActiveStores } from "@/modules/erp/services/store-context.service";

export type StoreWiseStockRow = {
  store_id: string;
  store_name: string;
  sku_count: number;
  total_stock: number;
  total_reserved: number;
  stock_value_at_cost: number;
};

type SpiRow = {
  store_id: string;
  product_id: string;
  stock: number | null;
  purchase_price: number | null;
  products: { purchase_price: number | null } | null;
};

function unitCost(spi: SpiRow): number {
  const fromSpi = spi.purchase_price;
  if (fromSpi != null && Number(fromSpi) > 0) return Number(fromSpi);
  const fromProduct = spi.products?.purchase_price;
  if (fromProduct != null && Number(fromProduct) > 0) return Number(fromProduct);
  return 0;
}

function aggregateStoreRows(
  storeId: string,
  storeName: string,
  spiRows: SpiRow[],
): StoreWiseStockRow {
  let totalStock = 0;
  let stockValue = 0;
  const skusWithStock = new Set<string>();

  for (const row of spiRows) {
    const stock = Number(row.stock ?? 0);
    totalStock += stock;
    stockValue += stock * unitCost(row);
    if (stock !== 0) skusWithStock.add(row.product_id);
  }

  return {
    store_id: storeId,
    store_name: storeName,
    sku_count: skusWithStock.size,
    total_stock: roundMoney(totalStock),
    total_reserved: 0,
    stock_value_at_cost: roundMoney(stockValue),
  };
}

/** Store-wise totals from `store_product_inventory` (same source as item stock report). */
export async function listStoreWiseStockReportRows(): Promise<StoreWiseStockRow[]> {
  const supabase = await createSupabaseServerClient();
  const stores = await listActiveStores();
  if (stores.length === 0) return [];

  const storeIds = stores.map((s) => s.id);
  const { data, error } = await supabase
    .from("store_product_inventory")
    .select(
      "store_id, product_id, stock, purchase_price, products!inner(purchase_price, item_type)",
    )
    .in("store_id", storeIds)
    .eq("products.item_type", "goods");

  if (error) throw new Error(error.message);

  const byStore = new Map<string, SpiRow[]>();
  for (const row of (data ?? []) as SpiRow[]) {
    const list = byStore.get(row.store_id) ?? [];
    list.push(row);
    byStore.set(row.store_id, list);
  }

  return stores
    .map((store) =>
      aggregateStoreRows(store.id, store.name, byStore.get(store.id) ?? []),
    )
    .sort((a, b) => a.store_name.localeCompare(b.store_name));
}
