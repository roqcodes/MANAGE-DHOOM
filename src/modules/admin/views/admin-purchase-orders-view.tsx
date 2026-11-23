"use client";

import { useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { AdminPurchaseOrdersPanel } from "@/modules/purchase-orders/components/admin-purchase-orders-panel";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import { useErpFormModal } from "@/modules/admin/ui";
import { PurchaseOrderFormView } from "@/modules/admin/views/purchasing/purchase-order-form-view";
import { EMPTY_PURCHASE_ORDER_CATALOG_STATS } from "@/modules/admin/lib/catalog-loading-defaults";
import {
  parsePurchaseOrderDeliveryMonth,
  parsePurchaseOrderStatusFilter,
} from "@/modules/purchase-orders/components/purchase-orders-ui";
import {
  purchaseOrdersCatalogStatsQueryOptions,
  purchaseOrdersListQueryKey,
  purchaseOrdersListQueryOptions,
} from "@/modules/purchase-orders/lib/purchase-orders-list-query";

export function AdminPurchaseOrdersView() {
  const queryClient = useQueryClient();
  const { isOpen, mode, editId, modalProps } = useErpFormModal("/admin/purchase-orders");
  const [reloadToken, setReloadToken] = useState(0);
  const searchParams = useSearchParams();
  const status = parsePurchaseOrderStatusFilter(searchParams.get("status"));
  const deliveryMonth = parsePurchaseOrderDeliveryMonth(
    searchParams.get("deliveryMonth"),
  );
  const rawVendor = searchParams.get("vendorId")?.trim();
  const vendorId = rawVendor && rawVendor.length > 0 ? rawVendor : null;
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));

  const statsQuery = useQuery({
    ...purchaseOrdersCatalogStatsQueryOptions(),
    queryKey: [...purchaseOrdersCatalogStatsQueryOptions().queryKey, reloadToken],
  });

  const {
    data,
    isPending,
    isFetching,
    isError,
    error,
  } = useQuery({
    ...purchaseOrdersListQueryOptions(status, deliveryMonth, vendorId, page),
    queryKey: [
      ...purchaseOrdersListQueryKey(status, deliveryMonth, vendorId, page),
      reloadToken,
    ],
    placeholderData: keepPreviousData,
  });

  const initialLoading = isPending && !data;
  const listRefetching = isFetching && !isPending;

  function handleOrdersMutated() {
    setReloadToken((t) => t + 1);
    void queryClient.invalidateQueries({
      queryKey: adminQueryKeys.purchaseOrdersCatalogStats(),
    });
  }

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
  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-3 sm:px-4 sm:py-4">
      <AdminPurchaseOrdersPanel
        initialLoading={initialLoading}
        orders={data?.data ?? []}
        total={data?.total ?? 0}
        page={data?.page ?? page}
        statusFilter={status}
        deliveryMonthFilter={deliveryMonth}
        selectedVendorId={data?.vendorId ?? vendorId}
        stats={statsQuery.data?.stats ?? EMPTY_PURCHASE_ORDER_CATALOG_STATS}
        listRefetching={listRefetching}
        onOrdersMutated={handleOrdersMutated}
      />

      {isOpen ? (
        <PurchaseOrderFormView
          variant="modal"
          mode={mode}
          poId={editId ?? undefined}
          open={modalProps.open}
          onOpenChange={modalProps.onOpenChange}
          onSuccess={handleOrdersMutated}
        />
      ) : null}
    </div>
  );
}
