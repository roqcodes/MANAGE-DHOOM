"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";

import type { OrderWithItems } from "@/common/admin/types";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { OrderDetailPanel } from "@/modules/orders/components/order-detail-panel";
import { adminGetNullable } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";

type OrderDetailPayload = { order: OrderWithItems };

export function SalesOrderDetailView({ orderId }: { orderId: string }) {
  const { data, isPending, isError, error } = useQuery({
    queryKey: adminQueryKeys.orderDetail(orderId),
    queryFn: () => adminGetNullable<OrderDetailPayload>(`orders/${orderId}`),
    enabled: Boolean(orderId),
    placeholderData: keepPreviousData,
  });

  if (!orderId) {
    return (
      <div className="mx-auto w-full max-w-7xl px-3 py-6 sm:px-4">
        <p className="text-sm font-medium text-muted-foreground">Missing sales order id.</p>
      </div>
    );
  }

  if (isPending && data === undefined) return <AdminPageSkeleton />;
  if (isError) {
    return (
      <div className="mx-auto w-full max-w-7xl px-3 py-6 sm:px-4">
        <div className="flex items-start gap-3 rounded-xl border border-rose-200/60 bg-rose-50/40 p-5">
          <AlertTriangle className="size-5 shrink-0 text-rose-600" />
          <div>
            <p className="text-sm font-semibold text-rose-900">Failed to load sales order.</p>
            <p className="mt-1 text-sm text-rose-700">
              {error instanceof Error ? error.message : "Unknown error."}
            </p>
          </div>
        </div>
        <Link
          href="/admin/erp/sales-orders"
          className="mt-6 inline-flex text-sm font-medium text-primary hover:underline"
        >
          Back to sales orders
        </Link>
      </div>
    );
  }
  if (data === null) {
    return (
      <div className="mx-auto w-full max-w-7xl px-3 py-6 sm:px-4">
        <p className="text-sm font-medium text-muted-foreground">
          This sales order could not be found.
        </p>
        <Link
          href="/admin/erp/sales-orders"
          className="mt-4 inline-flex text-sm font-medium text-primary hover:underline"
        >
          Back to sales orders
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-3 sm:px-4 sm:py-4">
      <OrderDetailPanel order={data.order} />
    </div>
  );
}
