import type { ErpLineInput } from "@/common/erp/sales-types";

export type SalesInvoiceLinePayload = ErpLineInput;

export type SalesInvoiceCreatePayload = {
  userId: string;
  invoiceDate: string;
  dueDate: string;
  lines: SalesInvoiceLinePayload[];
  discount?: number;
  taxInclusive?: boolean;
  reference?: string;
  notes?: string;
  salesPersonId?: string;
  estimateId?: string;
  finalize?: boolean;
};

export type SalesInvoiceUpdatePayload = {
  invoiceId: string;
  invoiceDate: string;
  dueDate: string;
  lines: SalesInvoiceLinePayload[];
  discount?: number;
  taxInclusive?: boolean;
  reference?: string;
  notes?: string;
};

export type SalesInvoiceIssuePayload = {
  invoiceId: string;
};

export type SalesInvoiceCancelPayload = {
  invoiceId: string;
};

export function salesInvoiceResourceScope(invoiceId: string): string {
  return `sales_invoice:${invoiceId}`;
}
