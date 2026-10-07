"use client";

import { useCallback, useState } from "react";

export type ErpInvoicePrintModalOpenOptions = {
  autoDownload?: boolean;
};

export function useErpInvoicePrintModal() {
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [autoDownload, setAutoDownload] = useState(false);

  const openInvoicePrint = useCallback(
    (id: string, options?: ErpInvoicePrintModalOpenOptions) => {
      setInvoiceId(id);
      setAutoDownload(options?.autoDownload ?? false);
    },
    [],
  );

  const onOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setInvoiceId(null);
      setAutoDownload(false);
    }
  }, []);

  return {
    openInvoicePrint,
    invoicePrintModalProps: {
      invoiceId,
      open: invoiceId !== null,
      autoDownload,
      onOpenChange,
    },
  };
}
