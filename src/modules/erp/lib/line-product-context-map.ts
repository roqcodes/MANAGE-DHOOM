import type { LineProductContext, LineProductContextMap } from "@/common/erp/line-product-context";
import { roundMoney } from "@/common/erp/purchasing-types";

export type LineProductContextRpcRow = {
  product_id: string;
  on_hand_stock: number | null;
  catalog_purchase_price: number | null;
  tax_rate_percent: number | null;
  store_sales_price: number | null;
  avg_purchase_price: number | null;
  last_purchase_price: number | null;
  last_bill_purchase_rate: number | null;
  vendor_last_bill_purchase_rate: number | null;
  counterparty_last_price: number | null;
  last_selling_price: number | null;
  avg_selling_price: number | null;
};

function money(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const n = Number(value);
  if (n <= 0) return null;
  return roundMoney(n);
}

export function mapLineProductContextRpcRow(row: LineProductContextRpcRow): LineProductContext {
  const onHand = Number(row.on_hand_stock ?? 0);
  return {
    productId: row.product_id,
    onHandStock: onHand,
    availableStock: Math.max(0, onHand),
    avgPurchasePrice: money(row.avg_purchase_price),
    lastPurchasePrice: money(row.last_purchase_price),
    avgSellingPrice: money(row.avg_selling_price),
    lastSellingPrice: money(row.last_selling_price),
    counterpartyLastPrice: money(row.counterparty_last_price),
    storeSalesPrice: money(row.store_sales_price),
    catalogPurchasePrice: money(row.catalog_purchase_price),
    lastBillPurchaseRate: money(row.last_bill_purchase_rate),
    vendorLastBillPurchaseRate: money(row.vendor_last_bill_purchase_rate),
    taxRatePercent:
      row.tax_rate_percent != null && Number.isFinite(Number(row.tax_rate_percent))
        ? Number(row.tax_rate_percent)
        : null,
  };
}

export function mapLineProductContextRpcRows(
  rows: LineProductContextRpcRow[],
  productIds: string[],
): LineProductContextMap {
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
      lastBillPurchaseRate: null,
      vendorLastBillPurchaseRate: null,
      taxRatePercent: null,
    };
  }
  for (const row of rows) {
    if (!row?.product_id || !result[row.product_id]) continue;
    result[row.product_id] = mapLineProductContextRpcRow(row);
  }
  return result;
}
