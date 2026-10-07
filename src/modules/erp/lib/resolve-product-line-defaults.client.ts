"use client";

import type { LineProductContextMap } from "@/common/erp/line-product-context";
import type { ErpProductSearchRow } from "@/common/erp/purchasing-types";
import type { ErpSalesProductSearchRow } from "@/common/erp/sales-types";
import { adminGet } from "@/modules/admin/lib/admin-api-client";

async function fetchProductContext(
  productId: string,
  options: { storeId: string; customerId?: string; vendorId?: string },
): Promise<LineProductContextMap[string] | null> {
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

/** First strictly positive price; zero is treated as unset (common on store inventory rows). */
function firstPositivePrice(...candidates: (number | null | undefined)[]): number | null {
  for (const value of candidates) {
    if (value != null && value > 0) return value;
  }
  return null;
}

/** Instant defaults from catalog search (shown in the line table immediately). */
export function salesLineDefaultsFromSearchRow(row: ErpSalesProductSearchRow) {
  return {
    unitPrice: row.sales_price ?? 0,
    taxRatePercent: row.tax_rate_percent ?? 0,
  };
}

/** Instant defaults from purchase catalog search. */
export function purchaseLineDefaultsFromSearchRow(row: ErpProductSearchRow) {
  return {
    purchasePrice: row.purchase_price ?? 0,
    taxRatePercent: row.tax_rate_percent ?? 0,
  };
}

/** Authoritative store/catalog defaults for a sales line (search row is fallback only). */
export async function resolveSalesLineDefaultsFromSelection(
  row: ErpSalesProductSearchRow,
  options: { storeId?: string; customerId?: string },
): Promise<{ unitPrice: number; taxRatePercent: number }> {
  const { unitPrice: searchUnitPrice, taxRatePercent: searchTax } =
    salesLineDefaultsFromSearchRow(row);
  let unitPrice = searchUnitPrice;
  let taxRatePercent = searchTax;

  if (!options.storeId) {
    return { unitPrice, taxRatePercent };
  }

  try {
    const ctx = await fetchProductContext(row.id, {
      storeId: options.storeId,
      customerId: options.customerId,
    });
    if (!ctx) return { unitPrice, taxRatePercent };

    const resolved = firstPositivePrice(
      ctx.storeSalesPrice,
      ctx.counterpartyLastPrice,
      ctx.lastSellingPrice,
      ctx.avgSellingPrice,
      searchUnitPrice,
    );
    if (resolved != null) unitPrice = resolved;

    if (ctx.taxRatePercent != null) {
      taxRatePercent = ctx.taxRatePercent;
    }
  } catch {
    /* keep search fallbacks */
  }

  return { unitPrice, taxRatePercent };
}

/** Authoritative catalog defaults for a purchase line (search row is fallback only). */
export async function resolvePurchaseLineDefaultsFromSelection(
  row: ErpProductSearchRow,
  options: { storeId?: string; vendorId?: string },
): Promise<{ purchasePrice: number; taxRatePercent: number }> {
  const { purchasePrice: searchPrice, taxRatePercent: searchTax } =
    purchaseLineDefaultsFromSearchRow(row);
  let purchasePrice = searchPrice;
  let taxRatePercent = searchTax;

  if (!options.storeId) {
    return { purchasePrice, taxRatePercent };
  }

  try {
    const ctx = await fetchProductContext(row.id, {
      storeId: options.storeId,
      vendorId: options.vendorId,
    });
    if (!ctx) return { purchasePrice, taxRatePercent };

    if (ctx.catalogPurchasePrice != null) {
      purchasePrice = ctx.catalogPurchasePrice;
    } else if (ctx.counterpartyLastPrice != null) {
      purchasePrice = ctx.counterpartyLastPrice;
    } else if (ctx.lastPurchasePrice != null) {
      purchasePrice = ctx.lastPurchasePrice;
    } else if (ctx.avgPurchasePrice != null) {
      purchasePrice = ctx.avgPurchasePrice;
    }

    if (ctx.taxRatePercent != null) {
      taxRatePercent = ctx.taxRatePercent;
    }
  } catch {
    /* keep search fallbacks */
  }

  return { purchasePrice, taxRatePercent };
}
