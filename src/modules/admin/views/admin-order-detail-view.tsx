"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect } from "react";

import type { OrderWithItems } from "@/common/admin/types";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { OrderDetailPanel } from "@/modules/orders/components/order-detail-panel";
import { ORDERS_ACCENT } from "@/modules/orders/components/orders-ui";
import { adminGetNullable } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";

type OrderDetailPayload = { order: OrderWithItems };

export function AdminOrderDetailView() {
  const router = useRouter();
  const params = useParams();
  const slug = (params.slug as string[] | undefined) ?? [];
  const id =
    slug[0] === "orders" && typeof slug[1] === "string" ? slug[1] : "";

  const { data, isPending, isError, error } = useQuery({
    queryKey: adminQueryKeys.orderDetail(id),
    queryFn: () => adminGetNullable<OrderDetailPayload>(`orders/${id}`),
    enabled: Boolean(id),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (data?.order?.source === "sales_order") {
      router.replace(`/admin/erp/sales-orders/${id}`);
    }
  }, [data?.order?.source, id, router]);

  if (!id) {
    return (
      <div className="mx-auto w-full max-w-7xl px-3 py-6 sm:px-4">
        <p className="text-sm font-medium text-muted-foreground">
          Missing order id.
        </p>
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
            <p className="text-sm font-semibold text-rose-900">
              Failed to load order.
            </p>
            <p className="mt-1 text-sm text-rose-700">
              {error instanceof Error ? error.message : "Unknown error."}
            </p>
          </div>
        </div>
        <Link
          href="/admin/orders"
          className={`mt-6 inline-flex text-sm font-medium hover:underline ${ORDERS_ACCENT.link}`}
        >
          Back to orders
        </Link>
      </div>
    );
  }
  if (data === null) {
    return (
      <div className="mx-auto w-full max-w-7xl px-3 py-6 sm:px-4">
        <p className="text-sm font-medium text-muted-foreground">
          This order could not be found.
        </p>
        <Link
          href="/admin/orders"
          className={`mt-4 inline-flex text-sm font-medium hover:underline ${ORDERS_ACCENT.link}`}
        >
          Back to orders
        </Link>
      </div>
    );
  }

  if (data.order.source === "sales_order") {
    return <AdminPageSkeleton />;
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-3 sm:px-4 sm:py-4">
      <OrderDetailPanel order={data.order} />
    </div>
  );
}
