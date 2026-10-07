"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import type { AdminPurchaseOrderDetail } from "@/common/admin/types";
import { InvoicePrintToolbar } from "@/modules/admin/components/invoice-print-toolbar";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { PurchaseOrderInvoiceDocument } from "@/modules/purchase-orders/components/purchase-order-invoice-document";
import { adminGetNullable } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";

type PoDetailPayload = { po: AdminPurchaseOrderDetail };

function shortPoRef(id: string) {
  return `${id.slice(0, 8)}…`;
}

export function AdminPurchaseOrderInvoicePage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";

  const { data, isPending, isError, error } = useQuery({
    queryKey: adminQueryKeys.purchaseOrderDetail(id),
    queryFn: () => adminGetNullable<PoDetailPayload>(`purchase-orders/${id}`),
    enabled: Boolean(id),
    placeholderData: keepPreviousData,
  });

  if (!id) {
    return (
      <div className="px-3 py-6 sm:px-4">
        <p className="text-sm font-semibold text-slate-600">
          Missing purchase order id.
        </p>
      </div>
    );
  }

  if (isPending && data === undefined) return <AdminPageSkeleton />;
  if (isError) {
    return (
      <div className="px-3 py-6 sm:px-4">
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200/60 bg-rose-50/40 p-5 print:hidden">
          <AlertTriangle className="size-5 shrink-0 text-rose-600" />
          <div>
            <p className="text-sm font-semibold text-rose-900">
              Failed to load purchase order.
            </p>
            <p className="mt-1 text-[13px] font-medium text-rose-700">
              {error instanceof Error ? error.message : "Unknown error."}
            </p>
          </div>
        </div>
      </div>
    );
  }
  if (data === null) {
    return (
      <div className="px-3 py-6 sm:px-4">
        <p className="text-sm font-medium text-slate-600 print:hidden">
          This purchase order could not be found.
        </p>
      </div>
    );
  }

  const { po } = data;

  return (
    <div className="min-h-0 flex-1 bg-slate-50 print:bg-white">
      <InvoicePrintToolbar
        backHref={`/admin/purchase-orders/${po.id}`}
        title={`PO invoice · ${shortPoRef(po.id)}`}
      />
      <div className="pb-10 pt-4 print:pb-0 print:pt-0">
        <PurchaseOrderInvoiceDocument po={po} />
      </div>
    </div>
  );
}
