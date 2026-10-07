"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useParams, useSearchParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { OrderWithItems } from "@/common/admin/types";
import { InvoicePrintToolbar } from "@/modules/admin/components/invoice-print-toolbar";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { OrderInvoiceDocument } from "@/modules/orders/components/order-invoice-document";
import { buildOrderInvoiceFilename } from "@/modules/orders/lib/invoice-filename";
import { adminGetNullable } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import { downloadElementAsPdf } from "@/lib/html2pdf-download";

type OrderDetailPayload = { order: OrderWithItems };

function shortOrderRef(id: string) {
  return id.split("-")[0]?.toUpperCase() ?? id.slice(0, 8);
}

function AdminOrderInvoiceContent({ order }: { order: OrderWithItems }) {
  const searchParams = useSearchParams();
  const [downloading, setDownloading] = useState(false);
  const autoDownloadedRef = useRef(false);

  const handleDownloadPdf = useCallback(async () => {
    const element = document.querySelector("[data-invoice-document]");
    if (!(element instanceof HTMLElement)) return;

    setDownloading(true);
    try {
      await downloadElementAsPdf(element, buildOrderInvoiceFilename(order));
    } finally {
      setDownloading(false);
    }
  }, [order]);

  useEffect(() => {
    if (
      searchParams.get("download") === "1" &&
      !autoDownloadedRef.current &&
      !downloading
    ) {
      autoDownloadedRef.current = true;
      void handleDownloadPdf();
    }
  }, [searchParams, downloading, handleDownloadPdf]);

  return (
    <div className="min-h-0 flex-1 bg-slate-50 print:bg-white">
      <InvoicePrintToolbar
        backHref={`/admin/orders/${order.id}`}
        title={`Order invoice · #${shortOrderRef(order.id)}`}
        onDownloadPdf={handleDownloadPdf}
        downloading={downloading}
      />
      <div className="pb-10 pt-4 print:pb-0 print:pt-0">
        <OrderInvoiceDocument order={order} />
      </div>
    </div>
  );
}

export function AdminOrderInvoicePage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";

  const { data, isPending, isError, error } = useQuery({
    queryKey: adminQueryKeys.orderDetail(id),
    queryFn: () => adminGetNullable<OrderDetailPayload>(`orders/${id}`),
    enabled: Boolean(id),
    placeholderData: keepPreviousData,
  });

  if (!id) {
    return (
      <div className="px-3 py-6 sm:px-4">
        <p className="text-sm font-semibold text-slate-600">Missing order id.</p>
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
            <p className="text-sm font-semibold text-rose-900">Failed to load order.</p>
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
          This order could not be found.
        </p>
      </div>
    );
  }

  return <AdminOrderInvoiceContent order={data.order} />;
}
