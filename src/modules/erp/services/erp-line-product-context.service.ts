import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type { LineProductContext, LineProductContextMap } from "@/common/erp/line-product-context";
import { resolveErpStoreId } from "@/modules/erp/services/store-context.service";

function latestPriceByProduct(
  rows: { productId: string; price: number; at: string }[],
): Map<string, number> {
  const map = new Map<string, number>();
  const sorted = [...rows].sort((a, b) => b.at.localeCompare(a.at));
  for (const row of sorted) {
    if (!map.has(row.productId)) {
      map.set(row.productId, row.price);
    }
  }
  return map;
}

function weightedAvgByProduct(
  rows: { productId: string; price: number; qty: number }[],
): Map<string, number> {
  const sumVal = new Map<string, number>();
  const sumQty = new Map<string, number>();
  for (const row of rows) {
    if (row.qty <= 0) continue;
    sumVal.set(row.productId, (sumVal.get(row.productId) ?? 0) + row.price * row.qty);
    sumQty.set(row.productId, (sumQty.get(row.productId) ?? 0) + row.qty);
  }
  const out = new Map<string, number>();
  for (const [productId, qty] of sumQty) {
    const val = sumVal.get(productId) ?? 0;
    if (qty > 0) out.set(productId, Math.round((val / qty) * 10000) / 10000);
  }
  return out;
}

/** Context panel data for purchase/sales line items (per product). */
export async function getLineProductContext(input: {
  storeId?: string;
  productIds: string[];
  customerId?: string;
  vendorId?: string;
}): Promise<LineProductContextMap> {
  await requireAdminOrManagerProfile();
  const productIds = [...new Set(input.productIds.filter(Boolean))];
  if (productIds.length === 0) return {};

  const storeId = await resolveErpStoreId(input.storeId);
  if (!storeId) return {};

  const supabase = await createSupabaseServerClient();
  const result: LineProductContextMap = {};

  for (const productId of productIds) {
    result[productId] = {
      productId,
      onHandStock: 0,
      availableStock: 0,
      avgPurchasePrice: null,
      lastPurchasePrice: null,
      avgSellingPrice: null,
      lastSellingPrice: null,
      counterpartyLastPrice: null,
      storeSalesPrice: null,
      catalogPurchasePrice: null,
      taxRatePercent: null,
    };
  }

  const { data: productRows } = await supabase
    .from("products")
    .select("id, purchase_price, price, tax_rate_percent")
    .in("id", productIds);

  for (const row of productRows ?? []) {
    const ctx = result[row.id];
    if (!ctx) continue;
    ctx.catalogPurchasePrice =
      row.purchase_price != null ? Number(row.purchase_price) : null;
    ctx.taxRatePercent =
      row.tax_rate_percent != null ? Number(row.tax_rate_percent) : null;
    ctx.storeSalesPrice = row.price != null ? Number(row.price) : null;
  }

  const { data: spiRows } = await supabase
    .from("store_product_inventory")
    .select("product_id, stock, purchase_price, sales_price")
    .eq("store_id", storeId)
    .in("product_id", productIds);

  for (const row of spiRows ?? []) {
    const ctx = result[row.product_id];
    if (!ctx) continue;
    const onHand = Number(row.stock ?? 0);
    ctx.onHandStock = onHand;
    ctx.availableStock = Math.max(0, onHand);
    ctx.avgPurchasePrice =
      row.purchase_price != null ? Number(row.purchase_price) : null;
    const spiSales = row.sales_price != null ? Number(row.sales_price) : null;
    if (spiSales != null && spiSales > 0) {
      ctx.storeSalesPrice = spiSales;
    }
  }

  const { data: billLines } = await supabase
    .from("erp_purchase_bill_lines")
    .select(
      "product_id, purchase_price, unit_loaded_cost, quantity, erp_purchase_bills!inner(store_id, vendor_id, purchase_date, created_at, status)",
    )
    .eq("erp_purchase_bills.store_id", storeId)
    .neq("erp_purchase_bills.status", "cancelled")
    .in("product_id", productIds);

  const lastPurchaseRows: { productId: string; price: number; at: string }[] = [];
  const vendorPurchaseRows: { productId: string; price: number; at: string }[] = [];

  for (const line of billLines ?? []) {
    const productId = line.product_id;
    if (!productId) continue;
    const bill = line.erp_purchase_bills as {
      vendor_id: string;
      purchase_date: string;
      created_at: string;
    };
    const at = bill.purchase_date ?? bill.created_at;
    const loaded = line.unit_loaded_cost;
    const price = Number(
      loaded != null && loaded > 0 ? loaded : (line.purchase_price ?? 0),
    );
    lastPurchaseRows.push({ productId, price, at });
    if (input.vendorId && bill.vendor_id === input.vendorId) {
      vendorPurchaseRows.push({ productId, price, at });
    }
  }

  const lastPurchaseMap = latestPriceByProduct(lastPurchaseRows);
  const vendorPurchaseMap = latestPriceByProduct(vendorPurchaseRows);

  const { data: invoiceLines } = await supabase
    .from("invoice_items")
    .select(
      "unit_price, quantity, product_id, invoices!inner(store_id, user_id, created_at, status)",
    )
    .eq("invoices.store_id", storeId)
    .neq("invoices.status", "cancelled")
    .in("product_id", productIds);

  const lastSellRows: { productId: string; price: number; at: string }[] = [];
  const customerSellRows: { productId: string; price: number; at: string }[] = [];
  const avgSellRows: { productId: string; price: number; qty: number }[] = [];

  for (const line of invoiceLines ?? []) {
    const productId = line.product_id;
    if (!productId || !result[productId]) continue;

    const invoice = line.invoices as {
      user_id: string;
      created_at: string;
    };
    const price = Number(line.unit_price ?? 0);
    const qty = Number(line.quantity ?? 0);
    const at = invoice.created_at;
    lastSellRows.push({ productId, price, at });
    avgSellRows.push({ productId, price, qty });
    if (input.customerId && invoice.user_id === input.customerId) {
      customerSellRows.push({ productId, price, at });
    }
  }

  const lastSellMap = latestPriceByProduct(lastSellRows);
  const customerSellMap = latestPriceByProduct(customerSellRows);
  const avgSellMap = weightedAvgByProduct(avgSellRows);

  for (const productId of productIds) {
    const ctx = result[productId];
    ctx.lastPurchasePrice = lastPurchaseMap.get(productId) ?? null;
    ctx.lastSellingPrice = lastSellMap.get(productId) ?? null;
    ctx.avgSellingPrice = avgSellMap.get(productId) ?? null;

    if (input.customerId) {
      ctx.counterpartyLastPrice = customerSellMap.get(productId) ?? null;
    } else if (input.vendorId) {
      ctx.counterpartyLastPrice = vendorPurchaseMap.get(productId) ?? null;
    }
  }

  return result;
}
