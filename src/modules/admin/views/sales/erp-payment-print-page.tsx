"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

import { AdminPrintSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { InvoicePrintToolbar } from "@/modules/admin/components/invoice-print-toolbar";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { downloadElementAsPdf } from "@/lib/html2pdf-download";
import { printDocumentElement } from "@/lib/print-document";
import { useAutoPrintOnLoad } from "@/lib/use-auto-print-on-load";
import {
  ErpPaymentPrintDocument,
  type ErpPaymentPrintData,
} from "@/modules/erp/components/erp-payment-print-document";

export function ErpPaymentPrintPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [detail, setDetail] = useState<ErpPaymentPrintData | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!id) return;
    adminGet<ErpPaymentPrintData>(`erp/payments/${id}`).then(setDetail);
  }, [id]);

  const handleDownloadPdf = useCallback(async () => {
    const element = document.querySelector("[data-print-document]");
    if (!(element instanceof HTMLElement) || !detail) return;
    setDownloading(true);
    try {
      await downloadElementAsPdf(element, `${detail.payment_number}.pdf`);
    } finally {
      setDownloading(false);
    }
  }, [detail]);

  useAutoPrintOnLoad(
    Boolean(
      detail &&
        searchParams.get("print") === "1" &&
        searchParams.get("download") !== "1",
    ),
  );

  useEffect(() => {
    if (searchParams.get("download") === "1" && detail && !downloading) {
      void handleDownloadPdf();
    }
  }, [searchParams, detail, downloading, handleDownloadPdf]);

  if (!detail) {
    return <AdminPrintSkeleton />;
  }

  return (
    <div className="min-h-0 flex-1 bg-slate-50 print:bg-white">
      <InvoicePrintToolbar
        backHref={`/admin/erp/payments/${id}`}
        title={`Payment receipt · ${detail.payment_number}`}
        onDownloadPdf={handleDownloadPdf}
        downloading={downloading}
        onPrint={() => {
          const element = document.querySelector("[data-print-document]");
          if (element instanceof HTMLElement) printDocumentElement(element);
        }}
      />
      <div className="flex justify-center pb-10 pt-4 print:pb-0 print:pt-0">
        <ErpPaymentPrintDocument payment={detail} />
      </div>
    </div>
  );
}
