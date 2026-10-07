"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import type {
  AdminPurchaseOrderListRow,
  PurchaseOrderCatalogStats,
  PurchaseOrderDeliveryFilter,
  PurchaseOrderStatusFilter,
} from "@/common/admin/types";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { AdminPurchaseOrdersPanel } from "@/modules/purchase-orders/components/admin-purchase-orders-panel";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import { useErpFormModal } from "@/modules/admin/ui";
import { PurchaseOrderFormView } from "@/modules/admin/views/purchasing/purchase-order-form-view";
import {
  buildPurchaseOrdersListParams,
  parsePurchaseOrderDeliveryFilter,
  parsePurchaseOrderStatusFilter,
} from "@/modules/purchase-orders/components/purchase-orders-ui";

export function AdminPurchaseOrdersView() {
  const { isOpen, mode, editId, modalProps } = useErpFormModal("/admin/purchase-orders");
  const [reloadToken, setReloadToken] = useState(0);
  const searchParams = useSearchParams();
  const status = parsePurchaseOrderStatusFilter(searchParams.get("status"));
  const delivery = parsePurchaseOrderDeliveryFilter(searchParams.get("delivery"));
  const rawVendor = searchParams.get("vendorId")?.trim();
  const vendorId = rawVendor && rawVendor.length > 0 ? rawVendor : null;
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));

  const { data, isPending, isError, error } = useQuery({
    queryKey: [
      ...adminQueryKeys.purchaseOrders(status, delivery, vendorId, page),
      reloadToken,
    ],
    queryFn: () => {
      const qs = buildPurchaseOrdersListParams({
        status,
        delivery,
        vendorId,
        page,
      }).toString();
      return adminGet<{
        data: AdminPurchaseOrderListRow[];
        total: number;
        page: number;
        status: PurchaseOrderStatusFilter;
        delivery: PurchaseOrderDeliveryFilter | null;
        vendorId: string | null;
        stats: PurchaseOrderCatalogStats;
      }>(`purchase-orders${qs ? `?${qs}` : ""}`);
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
              Failed to load purchase orders.
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
      <AdminPurchaseOrdersPanel
        orders={data.data}
        total={data.total}
        page={data.page}
        statusFilter={status}
        deliveryFilter={delivery}
        selectedVendorId={data.vendorId}
        stats={data.stats}
      />

      {isOpen ? (
        <PurchaseOrderFormView
          variant="modal"
          mode={mode}
          poId={editId ?? undefined}
          open={modalProps.open}
          onOpenChange={modalProps.onOpenChange}
          onSuccess={() => setReloadToken((t) => t + 1)}
        />
      ) : null}
    </div>
  );
}
