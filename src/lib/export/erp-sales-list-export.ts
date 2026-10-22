import type {
  ErpCreditNoteListRow,
  ErpInvoiceListRow,
  ErpPaymentListRow,
} from "@/common/erp/sales-types";
import { creditKindLabel, formatCustomerCreditNoteRef } from "@/common/erp/commercial-discount";
import { paymentModeLabel } from "@/common/erp/sales-types";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { formatDateOnly } from "@/lib/format-date";
import { formatErpDocRef } from "@/lib/erp-document-ref";

export function getInvoicesExportTabular(rows: ErpInvoiceListRow[]) {
  const headers = [
    "Date",
    "Invoice #",
    "Store",
    "Channel",
    "Customer",
    "Status",
    "Due date",
    "Total",
    "Balance",
  ];
  const body = rows.map((row) => [
    row.created_at ? formatDateOnly(row.created_at) : "",
    row.invoice_number?.trim() || formatErpDocRef("INV", row.id),
    row.store_name ?? "",
    row.source ?? "",
    row.customer_name ?? "",
    row.status ?? "",
    row.due_date ? formatDateOnly(row.due_date) : "",
    formatCurrencyAmount(row.total_amount),
    formatCurrencyAmount(row.balance_due),
  ]);
  return { headers, rows: body };
}

export function getCreditNotesExportTabular(rows: ErpCreditNoteListRow[]) {
  const headers = [
    "Date",
    "Number",
    "Type",
    "Customer",
    "Store",
    "Status",
    "Total",
    "Balance",
  ];
  const body = rows.map((row) => [
    row.credit_note_date ? formatDateOnly(row.credit_note_date) : "",
    formatCustomerCreditNoteRef(row),
    creditKindLabel(row.credit_kind),
    row.customer_name ?? "",
    row.store_name ?? "",
    row.status ?? "",
    formatCurrencyAmount(row.total_amount),
    formatCurrencyAmount(row.balance_remaining),
  ]);
  return { headers, rows: body };
}

export function getPaymentsExportTabular(rows: ErpPaymentListRow[]) {
  const headers = [
    "Payment date",
    "Payment #",
    "Invoice #",
    "Customer",
    "Store",
    "Mode",
    "Paid amount",
    "Bank charges",
    "Unallocated",
  ];
  const body = rows.map((row) => [
    row.payment_date ? formatDateOnly(row.payment_date) : "",
    row.payment_number?.trim() || formatErpDocRef("PR", row.id),
    row.invoice_number?.trim() || "",
    row.customer_name ?? "",
    row.store_name ?? "",
    paymentModeLabel(row.payment_mode),
    formatCurrencyAmount(row.total_amount),
    formatCurrencyAmount(row.bank_charges),
    formatCurrencyAmount(row.unallocated_amount),
  ]);
  return { headers, rows: body };
}
