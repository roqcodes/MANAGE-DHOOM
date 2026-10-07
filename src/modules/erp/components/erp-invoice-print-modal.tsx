"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AdminPrintSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { downloadElementAsPdf } from "@/lib/html2pdf-download";
import { printDocumentElement } from "@/lib/print-document";
import {
  ErpInvoicePrintDocument,
  type ErpInvoicePrintData,
} from "@/modules/erp/components/erp-invoice-print-document";
import { A4_DIALOG_WIDTH_PX } from "@/lib/a4-document";

export type ErpInvoicePrintModalProps = {
  invoiceId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  autoDownload?: boolean;
};

export function ErpInvoicePrintModal({
  invoiceId,
  open,
  onOpenChange,
  autoDownload = false,
}: ErpInvoicePrintModalProps) {
  const [invoice, setInvoice] = useState<ErpInvoicePrintData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const autoDownloadedRef = useRef(false);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !invoiceId) {
      setInvoice(null);
      setError(null);
      autoDownloadedRef.current = false;
      return;
    }

    setLoading(true);
    setError(null);
    adminGet<ErpInvoicePrintData>(`erp/invoices/${invoiceId}`)
      .then(setInvoice)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load invoice"))
      .finally(() => setLoading(false));
  }, [open, invoiceId]);

  const handleDownloadPdf = useCallback(async () => {
    const element = previewRef.current?.querySelector("[data-invoice-document]");
    if (!(element instanceof HTMLElement) || !invoice) return;

    setDownloading(true);
    try {
      await downloadElementAsPdf(element, `${invoice.invoice_number}.pdf`);
    } finally {
      setDownloading(false);
    }
  }, [invoice]);

  const handlePrint = useCallback(() => {
    const element = previewRef.current?.querySelector("[data-invoice-document]");
    if (element instanceof HTMLElement) {
      printDocumentElement(element);
    }
  }, []);

  useEffect(() => {
    if (
      autoDownload &&
      invoice &&
      !autoDownloadedRef.current &&
      !downloading &&
      !loading
    ) {
      autoDownloadedRef.current = true;
      void handleDownloadPdf();
    }
  }, [autoDownload, invoice, downloading, loading, handleDownloadPdf]);

  const title = invoice
    ? `Tax invoice · ${invoice.invoice_number}`
    : "Invoice preview";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        style={{
          width: `min(98vw, ${A4_DIALOG_WIDTH_PX}px)`,
          maxWidth: A4_DIALOG_WIDTH_PX,
        }}
        className="!flex h-[min(96vh,1180px)] flex-col gap-0 overflow-hidden p-0 sm:!max-w-none"
      >
        <DialogHeader className="shrink-0 gap-3 border-b border-border px-4 py-3 text-left sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 pr-8">
              <DialogTitle className="truncate text-base font-semibold">{title}</DialogTitle>
              <DialogDescription className="text-sm">
                Preview, print, or download this invoice.
              </DialogDescription>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 print:hidden">
              <Button
                type="button"
                nativeButton
                variant="outline"
                size="sm"
                disabled={!invoice || downloading}
                onClick={() => void handleDownloadPdf()}
              >
                <Download data-icon="inline-start" />
                {downloading ? "Preparing…" : "Download PDF"}
              </Button>
              <Button
                type="button"
                nativeButton
                size="sm"
                disabled={!invoice}
                onClick={handlePrint}
              >
                <Printer data-icon="inline-start" />
                Print
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div
          ref={previewRef}
          className="flex min-h-0 flex-1 justify-center overflow-x-auto overflow-y-auto overscroll-contain bg-slate-100/90 px-4 py-5"
        >
          {loading ? (
            <AdminPrintSkeleton />
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : invoice ? (
            <div className="shrink-0">
              <ErpInvoicePrintDocument invoice={invoice} />
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
