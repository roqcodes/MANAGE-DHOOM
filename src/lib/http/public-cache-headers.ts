/**
 * HTTP caching for anonymous marketplace APIs only.
 * Never use on authenticated ERP/POS/inventory endpoints.
 */

export const PUBLIC_CATALOG_LIST_CACHE_CONTROL =
  "public, s-maxage=60, stale-while-revalidate=120";

export const PUBLIC_CATEGORIES_CACHE_CONTROL =
  "public, s-maxage=120, stale-while-revalidate=300";

/** Product detail includes indicative stock — must not be treated as authoritative. */
export const PUBLIC_PRODUCT_DETAIL_CACHE_CONTROL =
  "private, no-cache, no-store, must-revalidate";

export const NO_STORE_CACHE_CONTROL = "private, no-store";

export function withCacheControl(
  init: ResponseInit | undefined,
  cacheControl: string,
): ResponseInit {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", cacheControl);
  return { ...init, headers };
}
