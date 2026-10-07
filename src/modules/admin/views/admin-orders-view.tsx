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
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { OrdersPanel } from "@/modules/orders/components/orders-panel";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";

function parseOrderStatus(raw: string | null): OrderStatusFilter {
  if (raw && (ORDER_STATUS_FILTERS as readonly string[]).includes(raw)) {
    return raw as OrderStatusFilter;
  }
  return "all";
}

export function AdminOrdersView() {
  const searchParams = useSearchParams();
  const status = parseOrderStatus(searchParams.get("status"));
  const rawUser = searchParams.get("userId")?.trim();
  const userId = rawUser && rawUser.length > 0 ? rawUser : null;
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));

  const { data, isPending, isError, error } = useQuery({
    queryKey: adminQueryKeys.orders(status, userId, page),
    queryFn: () => {
      const q = new URLSearchParams();
      if (status !== "all") q.set("status", status);
      if (userId) q.set("userId", userId);
      if (page > 0) q.set("page", String(page));
      const qs = q.toString();
      return adminGet<{
        data: Order[];
        total: number;
        page: number;
        status: OrderStatusFilter;
        userId: string | null;
        filterUsers: OrderFilterUserRow[];
        stats: OrderCatalogStats;
      }>(`orders${qs ? `?${qs}` : ""}`);
    },
    placeholderData: keepPreviousData,
  });

  if (isPending && !data) return <AdminPageSkeleton />;
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
  if (!data) return <AdminPageSkeleton />;

  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-3 sm:px-4 sm:py-4">
      <OrdersPanel
        orders={data.data}
        total={data.total}
        page={data.page}
        statusFilter={data.status}
        filterUsers={data.filterUsers}
        selectedUserId={data.userId}
        stats={data.stats}
        channel="online"
        basePath="/admin/orders"
      />
    </div>
  );
}
