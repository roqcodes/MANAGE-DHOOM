"use client";

import { useCallback, useState } from "react";

import { documentPrintUrl } from "@/lib/print-document";
import { directPrintErpInvoice } from "@/lib/direct-document-print";
import { useAppFeedback } from "@/modules/feedback/components/app-feedback-provider";

export type ErpInvoicePrintModalOpenOptions = {
  autoDownload?: boolean;
};

/** Shareable URL for email / bookmarks (optional full-page print route). */
export function erpInvoicePrintUrl(
  invoiceId: string,
  options?: ErpInvoicePrintModalOpenOptions,
): string {
  const base = `/admin/erp/invoices/${invoiceId}/print`;
  return documentPrintUrl(base, options?.autoDownload ? "download" : "print");
}

/** Fetches the invoice and opens the system print dialog (or PDF download) on the current page. */
export function useErpInvoicePrintModal() {
  const { showError } = useAppFeedback();
  const [printPending, setPrintPending] = useState(false);

  const openInvoicePrint = useCallback(
    (id: string, options?: ErpInvoicePrintModalOpenOptions) => {
      const mode = options?.autoDownload ? "download" : "print";
      setPrintPending(true);
      void directPrintErpInvoice(id, mode)
        .catch((err) => {
          console.error(err);
          showError(err, "Couldn't print");
        })
        .finally(() => setPrintPending(false));
    },
    [showError],
  );

  return {
    openInvoicePrint,
    printPending,
  };
}
