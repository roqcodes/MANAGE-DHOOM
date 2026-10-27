import { isSalesInvoiceDraft } from "@/common/erp/document-status";

export const ERP_INVOICE_NOT_EDITABLE_CODE = "INVOICE_NOT_EDITABLE";

export const ERP_INVOICE_NOT_EDITABLE_MESSAGE =
  "Finalized invoices cannot be edited. Use credit notes, payments, or cancel and reissue.";

export type ErpInvoiceEditGateInput = {
  status: string;
  amount_paid?: number | null;
  credits_applied?: number | null;
};

/** Draft/pending only; no payments or credit applications. */
export function computeErpInvoiceEditable(invoice: ErpInvoiceEditGateInput): boolean {
  if (!isSalesInvoiceDraft(invoice.status)) return false;
  if (invoice.status === "cancelled") return false;
  return (
    Number(invoice.amount_paid ?? 0) === 0 && Number(invoice.credits_applied ?? 0) === 0
  );
}

export class ErpInvoiceNotEditableError extends Error {
  readonly code = ERP_INVOICE_NOT_EDITABLE_CODE;

  constructor(message = ERP_INVOICE_NOT_EDITABLE_MESSAGE) {
    super(message);
    this.name = "ErpInvoiceNotEditableError";
  }
}

export function assertErpInvoiceEditable(invoice: ErpInvoiceEditGateInput): void {
  if (!computeErpInvoiceEditable(invoice)) {
    throw new ErpInvoiceNotEditableError();
  }
}

export function isInvoiceNotEditableError(error: unknown): boolean {
  if (error instanceof ErpInvoiceNotEditableError) return true;
  if (error instanceof Error) {
    return (
      error.message.includes(ERP_INVOICE_NOT_EDITABLE_CODE) ||
      error.message.toLowerCase().includes("finalized invoices cannot be edited")
    );
  }
  return false;
}
