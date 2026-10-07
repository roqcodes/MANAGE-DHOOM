import "server-only";

import { revalidateTag } from "next/cache";

/** Next.js data cache tag for public ecommerce catalog (names, categories, list prices). */
export const PUBLIC_CATALOG_CACHE_TAG = "buyhub-public-catalog";

/** Reference tax rate list (not used for POS stock or balances). */
export const PUBLIC_TAX_RATES_CACHE_TAG = "buyhub-public-tax-rates";

export function revalidatePublicCatalog(): void {
  revalidateTag(PUBLIC_CATALOG_CACHE_TAG, "max");
}

export function revalidatePublicTaxRates(): void {
  revalidateTag(PUBLIC_TAX_RATES_CACHE_TAG, "max");
}

export function revalidatePublicReferenceData(): void {
  revalidatePublicCatalog();
  revalidatePublicTaxRates();
}
