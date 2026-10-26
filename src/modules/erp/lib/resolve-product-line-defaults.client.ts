"use client";

import type { LineProductContextMap } from "@/common/erp/line-product-context";
import type { ErpProductSearchRow } from "@/common/erp/purchasing-types";
import { roundMoney } from "@/common/erp/purchasing-types";
import type { ErpSalesProductSearchRow } from "@/common/erp/sales-types";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { rpcLineProductContext } from "@/modules/erp/lib/line-product-context-rpc.client";

async function fetchProductContext(
  productId: string,
  options: { storeId: string; customerId?: string; vendorId?: string },
): Promise<LineProductContextMap[string] | null> {
  const rpc = await rpcLineProductContext({
    storeId: options.storeId,
    productIds: [productId],
    customerId: options.customerId,
    vendorId: options.vendorId,
  });
  if (rpc?.[productId]) return rpc[productId];

  const params = new URLSearchParams({
    storeId: options.storeId,
    productIds: productId,
  });
  if (options.customerId) params.set("customerId", options.customerId);
  if (options.vendorId) params.set("vendorId", options.vendorId);
  const res = await adminGet<{ data: LineProductContextMap }>(
    `erp/line-product-context?${params.toString()}`,
  );
  return res.data[productId] ?? null;
}

/** First strictly positive price after money rounding; skips unset / zero / noise. */
export function firstPositivePrice(
  ...candidates: (number | null | undefined)[]
): number | null {
  for (const value of candidates) {
    if (value == null || !Number.isFinite(value) || value <= 0) continue;
    const rounded = roundMoney(value);
    if (rounded > 0) return rounded;
  }
  return null;
}

/** Tax from catalog search; unit rate is filled after line context loads (not catalog list price). */
export function salesLineDefaultsFromSearchRow(row: ErpSalesProductSearchRow) {
  return {
    taxRatePercent: row.tax_rate_percent ?? 0,
  };
}

function catalogSalesUnitPriceFromSearchRow(row: ErpSalesProductSearchRow): number {
  return roundMoney(row.sales_price ?? 0);
}

/** Tax from catalog search; unit rate is filled after line context loads (not catalog cost). */
export function purchaseLineDefaultsFromSearchRow(row: ErpProductSearchRow) {
  return {
    taxRatePercent: row.tax_rate_percent ?? 0,
  };
}

function catalogPurchaseUnitPriceFromSearchRow(row: ErpProductSearchRow): number {
  return roundMoney(row.purchase_price ?? 0);
}

/** Authoritative store/catalog defaults for a sales line (search row is fallback only). */
export async function resolveSalesLineDefaultsFromSelection(
  row: ErpSalesProductSearchRow,
  options: { storeId?: string; customerId?: string },
): Promise<{ unitPrice: number; taxRatePercent: number }> {
  const catalogUnitPrice = catalogSalesUnitPriceFromSearchRow(row);
  let taxRatePercent = salesLineDefaultsFromSearchRow(row).taxRatePercent;

  if (!options.storeId) {
    const unitPrice = firstPositivePrice(catalogUnitPrice) ?? 0;
    return { unitPrice: roundMoney(unitPrice), taxRatePercent };
  }

  try {
    const ctx = await fetchProductContext(row.id, {
      storeId: options.storeId,
      customerId: options.customerId,
    });

    const historical = ctx
      ? firstPositivePrice(
          ctx.counterpartyLastPrice,
          ctx.avgSellingPrice,
          ctx.lastSellingPrice,
        )
      : null;
    const unitPrice =
      historical ??
      firstPositivePrice(ctx?.storeSalesPrice, catalogUnitPrice) ??
      0;

    if (ctx?.taxRatePercent != null) {
      taxRatePercent = ctx.taxRatePercent;
    }

    return { unitPrice: roundMoney(unitPrice), taxRatePercent };
  } catch {
    const unitPrice = firstPositivePrice(catalogUnitPrice) ?? 0;
    return { unitPrice: roundMoney(unitPrice), taxRatePercent };
  }
}

/** Authoritative catalog defaults for a purchase line (search row is fallback only). */
export async function resolvePurchaseLineDefaultsFromSelection(
  row: ErpProductSearchRow,
  options: { storeId?: string; vendorId?: string },
): Promise<{ purchasePrice: number; taxRatePercent: number }> {
  const catalogUnitPrice = catalogPurchaseUnitPriceFromSearchRow(row);
  let taxRatePercent = purchaseLineDefaultsFromSearchRow(row).taxRatePercent;

  if (!options.storeId) {
    const purchasePrice = firstPositivePrice(catalogUnitPrice) ?? 0;
    return { purchasePrice: roundMoney(purchasePrice), taxRatePercent };
  }

  try {
    const ctx = await fetchProductContext(row.id, {
      storeId: options.storeId,
      vendorId: options.vendorId,
    });

    const fromAvgOrBills = ctx
      ? firstPositivePrice(
          ctx.avgPurchasePrice,
          ctx.lastBillPurchaseRate,
          ctx.lastPurchasePrice,
          ctx.vendorLastBillPurchaseRate,
          ctx.counterpartyLastPrice,
        )
      : null;
    const purchasePrice =
      fromAvgOrBills ??
      firstPositivePrice(ctx?.catalogPurchasePrice, catalogUnitPrice) ??
      0;

    if (ctx?.taxRatePercent != null) {
      taxRatePercent = ctx.taxRatePercent;
    }

    return {
      purchasePrice: roundMoney(purchasePrice),
      taxRatePercent,
    };
  } catch {
    const purchasePrice = firstPositivePrice(catalogUnitPrice) ?? 0;
    return { purchasePrice: roundMoney(purchasePrice), taxRatePercent };
  }
}
