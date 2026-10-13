"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import {
  ORDER_STATUS_FILTERS,
  type Order,
  type OrderCatalogStats,
  type OrderStatusFilter,
} from "@/common/admin/types";
import type { OrderFilterUserRow } from "@/modules/orders/services/orders.service";
import { EMPTY_ORDER_CATALOG_STATS } from "@/modules/admin/lib/catalog-loading-defaults";
import { OrdersPanel } from "@/modules/orders/components/orders-panel";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import { useErpStores } from "@/modules/erp/components/use-erp-stores";

function parseOrderStatus(raw: string | null): OrderStatusFilter {
  if (raw && (ORDER_STATUS_FILTERS as readonly string[]).includes(raw)) {
    return raw as OrderStatusFilter;
  }
  return "all";
}

export function AdminOrdersView() {
  const { activeStoreId, loading: erpContextLoading } = useErpStores();
  const searchParams = useSearchParams();
  const status = parseOrderStatus(searchParams.get("status"));
  const rawUser = searchParams.get("userId")?.trim();
  const userId = rawUser && rawUser.length > 0 ? rawUser : null;
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));

  const { data, isPending, isError, error } = useQuery({
    queryKey: adminQueryKeys.orders(status, userId, page, activeStoreId),
    queryFn: () => {
      const q = new URLSearchParams();
      q.set("channel", "online");
      if (status !== "all") q.set("status", status);
      if (userId) q.set("userId", userId);
      if (page > 0) q.set("page", String(page));
      if (activeStoreId) q.set("storeId", activeStoreId);
      const qs = q.toString();
      return adminGet<{
        data: Order[];
        total: number;
        page: number;
        status: OrderStatusFilter;
        userId: string | null;
        filterUsers: OrderFilterUserRow[];
        stats: OrderCatalogStats;
      }>(`orders?${qs}`);
    },
    placeholderData: keepPreviousData,
    enabled: !erpContextLoading,
  });
  const initialLoading = isPending && !data;

  if (isError) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-3 py-6 sm:px-4">
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200/60 bg-rose-50/40 p-5">
          <AlertTriangle className="size-5 shrink-0 text-rose-600" />
          <div>
            <p className="text-sm font-semibold text-rose-900">
              Failed to load orders.
            </p>
            <p className="mt-1 text-[13px] font-medium text-rose-700">
              {error instanceof Error ? error.message : "Unknown error."}
            </p>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-3 sm:px-4 sm:py-4">
      <OrdersPanel
        initialLoading={initialLoading}
        orders={data?.data ?? []}
        total={data?.total ?? 0}
        page={data?.page ?? page}
        statusFilter={data?.status ?? status}
        filterUsers={data?.filterUsers ?? []}
        selectedUserId={data?.userId ?? userId}
        stats={data?.stats ?? EMPTY_ORDER_CATALOG_STATS}
        channel="online"
        basePath="/admin/orders"
      />
    </div>
  );
}
