"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

import { AdminPrintSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { InvoicePrintToolbar } from "@/modules/admin/components/invoice-print-toolbar";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import {
  ErpInvoicePrintDocument,
  type ErpInvoicePrintData,
} from "@/modules/erp/components/erp-invoice-print-document";
import { downloadElementAsPdf } from "@/lib/html2pdf-download";
import { printDocumentElement } from "@/lib/print-document";

export function ErpInvoicePrintPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [invoice, setInvoice] = useState<ErpInvoicePrintData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const autoDownloadedRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    adminGet<ErpInvoicePrintData>(`erp/invoices/${id}`)
      .then(setInvoice)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load invoice"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleDownloadPdf = useCallback(async () => {
    const element = document.querySelector("[data-invoice-document]");
    if (!(element instanceof HTMLElement) || !invoice) return;

    setDownloading(true);
    try {
      await downloadElementAsPdf(element, `${invoice.invoice_number}.pdf`);
    } finally {
      setDownloading(false);
    }
  }, [invoice]);

  useEffect(() => {
    if (
      searchParams.get("download") === "1" &&
      invoice &&
      !autoDownloadedRef.current &&
      !downloading
    ) {
      autoDownloadedRef.current = true;
      void handleDownloadPdf();
    }
  }, [searchParams, invoice, downloading, handleDownloadPdf]);

  if (loading) {
    return <AdminPrintSkeleton />;
  }

  if (error || !invoice) {
    return <p className="p-6 text-sm text-destructive">{error ?? "Invoice not found."}</p>;
  }

  return (
    <div className="min-h-0 flex-1 bg-slate-50 print:bg-white">
      <InvoicePrintToolbar
        backHref={`/admin/erp/invoices/${id}`}
        title={`Tax invoice · ${invoice.invoice_number}`}
        onDownloadPdf={handleDownloadPdf}
        downloading={downloading}
        onPrint={() => {
          const element = document.querySelector("[data-invoice-document]");
          if (element instanceof HTMLElement) printDocumentElement(element);
        }}
      />
      <div className="flex justify-center overflow-x-auto bg-slate-100/90 pb-10 pt-4 print:bg-white print:pb-0 print:pt-0">
        <div className="shrink-0">
          <ErpInvoicePrintDocument invoice={invoice} />
        </div>
      </div>
    </div>
  );
}
