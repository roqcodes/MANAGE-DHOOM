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
import { AdminPageHeader, AdminPageLayout, useErpFormModal } from "@/modules/admin/ui";
import { SalesOrderOutboxBanner } from "@/modules/admin/components/sales-order-outbox-banner";
import { SalesOrderFormView } from "@/modules/admin/views/sales/sales-order-form-view";
import { useErpStores } from "@/modules/erp/components/use-erp-stores";

function parseOrderStatus(raw: string | null): OrderStatusFilter {
  if (raw && (ORDER_STATUS_FILTERS as readonly string[]).includes(raw)) {
    return raw as OrderStatusFilter;
  }
  return "all";
}

export function SalesOrdersListView() {
  const { activeStoreId, loading: erpContextLoading } = useErpStores();
  const { isOpen, modalProps } = useErpFormModal("/admin/erp/sales-orders");
  const searchParams = useSearchParams();
  const status = parseOrderStatus(searchParams.get("status"));
  const rawUser = searchParams.get("userId")?.trim();
  const userId = rawUser && rawUser.length > 0 ? rawUser : null;
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: adminQueryKeys.salesOrders(status, userId, page, activeStoreId),
    queryFn: () => {
      const q = new URLSearchParams();
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
      }>(`erp/sales-orders${qs ? `?${qs}` : ""}`);
    },
    placeholderData: keepPreviousData,
    enabled: !erpContextLoading && Boolean(activeStoreId),
  });

  if (isPending && !data) return <AdminPageSkeleton />;
  if (isError) {
    return (
      <AdminPageLayout>
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200/60 bg-rose-50/40 p-5">
          <AlertTriangle className="size-5 shrink-0 text-rose-600" />
          <div>
            <p className="text-sm font-semibold text-rose-900">Failed to load sales orders.</p>
            <p className="mt-1 text-[13px] font-medium text-rose-700">
              {error instanceof Error ? error.message : "Unknown error."}
            </p>
          </div>
        </div>
      </AdminPageLayout>
    );
  }
  if (!data) return <AdminPageSkeleton />;

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title=""
        breadcrumb={[{ label: "Sales orders", href: "/admin/erp/sales-orders" }]}
      />
      <SalesOrderOutboxBanner />
      <OrdersPanel
        orders={data.data}
        total={data.total}
        page={data.page}
        statusFilter={data.status}
        filterUsers={data.filterUsers}
        selectedUserId={data.userId}
        stats={data.stats}
        channel="erp"
        basePath="/admin/erp/sales-orders"
      />

      {isOpen ? (
        <SalesOrderFormView
          variant="modal"
          open={modalProps.open}
          onOpenChange={modalProps.onOpenChange}
          onSuccess={() => void refetch()}
        />
      ) : null}
    </AdminPageLayout>
  );
}
