import { invoiceCustomerDisplayName } from "@/modules/customers/lib/invoice-customer-display";

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

function sanitizeFilenameSegment(value: string, maxLen = 80): string {
  return value
    .trim()
    .replace(INVALID_FILENAME_CHARS, "")
    .replace(/\s+/g, " ")
    .slice(0, maxLen);
}

/** ERP / tax invoice PDF: `{customer} {invoice_number}.pdf` */
export function buildErpInvoicePdfFilename(invoice: {
  invoice_number: string;
  users?: { name?: string | null; company_name?: string | null } | null;
}): string {
  const customer = invoiceCustomerDisplayName(invoice.users, "Customer");
  const name = sanitizeFilenameSegment(customer);
  const number = sanitizeFilenameSegment(invoice.invoice_number, 40).replace(/\s/g, "");
  return `${name} ${number}.pdf`;
}

function formatInvoiceDatePart(value: string | null | undefined): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function shortOrderRef(id: string): string {
  return id.split("-")[0]?.toUpperCase() ?? id.slice(0, 8).toUpperCase();
}

export function shortPurchaseOrderRef(id: string): string {
  return id.split("-")[0]?.toUpperCase() ?? id.slice(0, 8).toUpperCase();
}

export function buildOrderInvoiceFilename(order: {
  id: string;
  created_at?: string | null;
}): string {
  const ref = shortOrderRef(order.id);
  const datePart = formatInvoiceDatePart(order.created_at);
  return `DHOOM-Order-Invoice-${ref}-${datePart}.pdf`;
}

export function buildPurchaseOrderInvoiceFilename(po: {
  id: string;
  created_at?: string | null;
}): string {
  const ref = shortPurchaseOrderRef(po.id);
  const datePart = formatInvoiceDatePart(po.created_at);
  return `DHOOM-PO-Invoice-${ref}-${datePart}.pdf`;
}
