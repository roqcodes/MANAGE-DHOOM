import type {
  AdminPurchaseOrderListRow,
  PurchaseOrderCatalogStats,
  PurchaseOrderStatusFilter,
} from "@/common/admin/types";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import { buildPurchaseOrdersListParams } from "@/modules/purchase-orders/components/purchase-orders-ui";
import type { PurchaseOrderDeliveryMonthFilter } from "@/modules/purchase-orders/lib/delivery-month-filter";

const PO_LIST_STALE_MS = 60_000;
const PO_STATS_STALE_MS = 90_000;

export function purchaseOrdersListQueryKey(
  status: PurchaseOrderStatusFilter,
  deliveryMonth: PurchaseOrderDeliveryMonthFilter,
  vendorId: string | null,
  page: number,
) {
  return adminQueryKeys.purchaseOrders(status, deliveryMonth, vendorId, page);
}

export function fetchPurchaseOrdersListPage(options: {
  status: PurchaseOrderStatusFilter;
  deliveryMonth: PurchaseOrderDeliveryMonthFilter;
  vendorId: string | null;
  page: number;
}) {
  const qs = buildPurchaseOrdersListParams({
    ...options,
    includeStats: false,
  }).toString();
  return adminGet<{
    data: AdminPurchaseOrderListRow[];
    total: number;
    page: number;
    status: PurchaseOrderStatusFilter;
    deliveryMonth: string;
    vendorId: string | null;
  }>(`purchase-orders${qs ? `?${qs}` : ""}`);
}

export function purchaseOrdersListQueryOptions(
  status: PurchaseOrderStatusFilter,
  deliveryMonth: PurchaseOrderDeliveryMonthFilter,
  vendorId: string | null,
  page: number,
) {
  return {
    queryKey: purchaseOrdersListQueryKey(status, deliveryMonth, vendorId, page),
    queryFn: () => fetchPurchaseOrdersListPage({ status, deliveryMonth, vendorId, page }),
    staleTime: PO_LIST_STALE_MS,
  } as const;
}

export function purchaseOrdersCatalogStatsQueryOptions() {
  return {
    queryKey: adminQueryKeys.purchaseOrdersCatalogStats(),
    queryFn: () =>
      adminGet<{ stats: PurchaseOrderCatalogStats }>(
        `purchase-orders?${buildPurchaseOrdersListParams({ statsOnly: true }).toString()}`,
      ),
    staleTime: PO_STATS_STALE_MS,
  } as const;
}