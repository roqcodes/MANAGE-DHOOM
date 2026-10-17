/**
 * ERP document lifecycle labels and status helpers.
 * Purchase bills use DB status `draft`; sales invoices use `pending` until posted (shown as Draft).
 */

export function isSalesInvoiceDraft(status: string | null | undefined): boolean {
  const s = (status ?? "").trim().toLowerCase();
  return s === "pending" || s === "draft";
}

/** Map stored invoice status → StatusBadge token (draft styling for unposted). */
export function salesInvoiceStatusForBadge(status: string): string {
  return isSalesInvoiceDraft(status) ? "draft" : status;
}

export function isPurchaseBillDraft(status: string | null | undefined): boolean {
  return (status ?? "").trim().toLowerCase() === "draft";
}

export const ERP_DOCUMENT_UI = {
  saveDraft: "Save draft",
  saveAndFinalize: "Save & finalize",
  finalizing: "Finalizing…",
  salesInvoice: {
    finalizeForm: "Finalize invoice",
    finalizeDetail: "Finalize & post to receivable",
    finalizeList: "Finalize",
  },
  purchaseBill: {
    finalizeForm: "Finalize bill",
    finalizeDetail: "Finalize & post to payable",
    finalizeList: "Finalize",
  },
} as const;
