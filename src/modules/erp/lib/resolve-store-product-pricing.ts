export type ProductCatalogPricing = {
  salesPrice: number | null;
  purchasePrice: number | null;
};

function toNum(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isPositivePrice(value: number | null | undefined): boolean {
  return value != null && Number.isFinite(value) && value > 0;
}

/** Catalog sales/purchase from product row + variants (matches Items list semantics). */
export function catalogPricingFromProductAndVariants(
  product: {
    price?: unknown;
    purchase_price?: unknown;
  } | null | undefined,
  variants: { price?: unknown; purchase_price?: unknown }[],
): ProductCatalogPricing {
  let variantSalesMin: number | null = null;
  let variantPurchase: number | null = null;

  for (const v of variants) {
    const sales = toNum(v.price);
    const purchase = toNum(v.purchase_price);
    if (sales != null) {
      variantSalesMin =
        variantSalesMin == null ? sales : Math.min(variantSalesMin, sales);
    }
    if (variantPurchase == null && purchase != null) {
      variantPurchase = purchase;
    }
  }

  const productSales = toNum(product?.price);
  const productPurchase = toNum(product?.purchase_price);

  return {
    salesPrice: productSales ?? variantSalesMin,
    purchasePrice: productPurchase ?? variantPurchase,
  };
}

/** Store override first; catalog (item details) as last fallback. */
export function resolveStoreSalesPrice(
  storeSales: number | null | undefined,
  catalog: ProductCatalogPricing,
): number | null {
  if (isPositivePrice(storeSales)) return storeSales!;
  if (isPositivePrice(catalog.salesPrice)) return catalog.salesPrice;
  return storeSales ?? catalog.salesPrice ?? null;
}

/** Store WAC / store cost first; catalog purchase as last fallback. */
export function resolveStorePurchasePrice(
  storePurchase: number | null | undefined,
  catalog: ProductCatalogPricing,
): number | null {
  if (isPositivePrice(storePurchase)) return storePurchase!;
  if (isPositivePrice(catalog.purchasePrice)) return catalog.purchasePrice;
  return storePurchase ?? catalog.purchasePrice ?? null;
}

/** Value stored on store_product_inventory only (for “Store WAC” / “Store sales” UI). */
export function storeInventoryOverridePrice(
  value: number | null | undefined,
): number | null {
  if (!isPositivePrice(value)) return null;
  return value!;
}
