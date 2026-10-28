import type { QueryClient } from "@tanstack/react-query";
import type { MinusStockDetailPayload } from "@/common/erp/inventory-types";
import { adminGet } from "@/modules/admin/lib/admin-api-client";

/** Store-scoped shortage detail; safe to cache briefly (movements change on new sales). */
export const MINUS_STOCK_DETAIL_STALE_MS = 120_000;

export function minusStockDetailQueryKey(storeId: string, productId: string) {
  return ["admin", "minus-stock-detail", storeId, productId] as const;
}

export function minusStockDetailApiPath(storeId: string, productId: string) {
  const q = new URLSearchParams({ productId, storeId });
  return `erp/minus-stock-detail?${q.toString()}`;
}

export function minusStockDetailQueryOptions(storeId: string, productId: string) {
  return {
    queryKey: minusStockDetailQueryKey(storeId, productId),
    queryFn: () =>
      adminGet<MinusStockDetailPayload>(minusStockDetailApiPath(storeId, productId)),
    staleTime: MINUS_STOCK_DETAIL_STALE_MS,
  } as const;
}

export function prefetchMinusStockDetail(
  queryClient: QueryClient,
  storeId: string,
  productId: string | undefined,
) {
  const pid = productId?.trim();
  if (!storeId || !pid) return;
  void queryClient.prefetchQuery(minusStockDetailQueryOptions(storeId, pid));
}
