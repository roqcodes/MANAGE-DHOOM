"use client";

import { useCallback, useState } from "react";

import { documentPrintUrl } from "@/lib/print-document";
import { directPrintErpInvoice } from "@/lib/direct-document-print";

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
  const [printPending, setPrintPending] = useState(false);

  const openInvoicePrint = useCallback(
    (id: string, options?: ErpInvoicePrintModalOpenOptions) => {
      const mode = options?.autoDownload ? "download" : "print";
      setPrintPending(true);
      void directPrintErpInvoice(id, mode)
        .catch((err) => {
          console.error(err);
          window.alert(
            err instanceof Error ? err.message : "Could not print this invoice.",
          );
        })
        .finally(() => setPrintPending(false));
    },
    [],
  );

  return {
    openInvoicePrint,
    printPending,
  };
}
