import type { ErpPurchaseLineInput } from "@/common/erp/purchasing-types";
import { roundMoney } from "@/common/erp/purchasing-types";
import type { ErpLineInput } from "@/common/erp/sales-types";

export const PURCHASE_BILL_AUDIT_FIELD_LABELS: Record<string, string> = {
  vendor: "Vendor",
  purchase_date: "Bill date",
  due_date: "Due date",
  vendor_bill_number: "Vendor bill #",
  reference: "Reference",
  notes: "Notes",
  discount: "Discount",
  total: "Total",
  line_items: "Line items",
};

export const SALES_INVOICE_AUDIT_FIELD_LABELS: Record<string, string> = {
  customer: "Customer",
  invoice_date: "Invoice date",
  due_date: "Due date",
  reference: "Reference",
  notes: "Notes",
  discount: "Discount",
  total: "Total",
  line_items: "Line items",
};

type PurchaseBillDetailRow = {
  vendor_id: string;
  vendors?: { name: string | null } | { name: string | null }[] | null;
  purchase_date: string;
  due_date: string | null;
  vendor_bill_number: string | null;
  reference: string | null;
  notes: string | null;
  discount: number | null;
  total_amount: number | null;
  erp_purchase_bill_lines?:
    | Array<{
        product_name: string | null;
        quantity: number | null;
        purchase_price: number | null;
        tax_rate_percent: number | null;
      }>
    | null;
};

function resolveEmbeddedName(
  embed: { name: string | null } | { name: string | null }[] | null | undefined,
): string | null {
  if (!embed) return null;
  const row = Array.isArray(embed) ? embed[0] : embed;
  return row?.name?.trim() || null;
}

function formatPurchaseLines(
  lines: PurchaseBillDetailRow["erp_purchase_bill_lines"],
): string {
  const rows = [...(lines ?? [])].sort((a, b) =>
    (a.product_name ?? "").localeCompare(b.product_name ?? ""),
  );
  if (rows.length === 0) return "—";
  return rows
    .map((line) => {
      const name = line.product_name?.trim() || "Item";
      const qty = Number(line.quantity ?? 0);
      const rate = roundMoney(Number(line.purchase_price ?? 0));
      const tax = Number(line.tax_rate_percent ?? 0);
      return `${name} ×${qty} @ ${rate}${tax ? ` (${tax}% tax)` : ""}`;
    })
    .join("; ");
}

export function purchaseBillAuditSnapshotFromDetail(
  detail: PurchaseBillDetailRow,
): Record<string, unknown> {
  const vendorName = resolveEmbeddedName(detail.vendors);
  return {
    vendor: vendorName ?? detail.vendor_id,
    purchase_date: detail.purchase_date,
    due_date: detail.due_date,
    vendor_bill_number: detail.vendor_bill_number,
    reference: detail.reference,
    notes: detail.notes,
    discount: roundMoney(Number(detail.discount ?? 0)),
    total: roundMoney(Number(detail.total_amount ?? 0)),
    line_items: formatPurchaseLines(detail.erp_purchase_bill_lines),
  };
}

export function purchaseBillAuditSnapshotFromInput(input: {
  vendorId: string;
  vendorName?: string | null;
  purchaseDate: string;
  dueDate?: string | null;
  vendorBillNumber?: string | null;
  reference?: string | null;
  notes?: string | null;
  discount?: number;
  totalAmount: number;
  lines: ErpPurchaseLineInput[];
}): Record<string, unknown> {
  const pseudoLines = input.lines.map((line) => ({
    product_name: line.productName,
    quantity: line.quantity,
    purchase_price: line.purchasePrice,
    tax_rate_percent: line.taxRatePercent,
  }));
  return {
    vendor: input.vendorName?.trim() || input.vendorId,
    purchase_date: input.purchaseDate,
    due_date: input.dueDate ?? null,
    vendor_bill_number: input.vendorBillNumber ?? null,
    reference: input.reference ?? null,
    notes: input.notes ?? null,
    discount: roundMoney(input.discount ?? 0),
    total: roundMoney(input.totalAmount),
    line_items: formatPurchaseLines(pseudoLines),
  };
}

type InvoiceDetailRow = {
  user_id: string;
  users?: {
    name: string | null;
    email: string | null;
    company_name: string | null;
  } | null;
  issued_at?: string | null;
  created_at?: string;
  due_date?: string | null;
  reference?: string | null;
  notes?: string | null;
  discount?: number | null;
  total_amount?: number | null;
  invoice_items?:
    | Array<{
        product_name: string | null;
        quantity: number | null;
        unit_price: number | null;
        gst_rate?: number | null;
      }>
    | null;
};

function formatInvoiceLines(lines: InvoiceDetailRow["invoice_items"]): string {
  const rows = [...(lines ?? [])].sort((a, b) =>
    (a.product_name ?? "").localeCompare(b.product_name ?? ""),
  );
  if (rows.length === 0) return "—";
  return rows
    .map((line) => {
      const name = line.product_name?.trim() || "Item";
      const qty = Number(line.quantity ?? 0);
      const rate = roundMoney(Number(line.unit_price ?? 0));
      const tax = Number(line.gst_rate ?? 0);
      return `${name} ×${qty} @ ${rate}${tax ? ` (${tax}% tax)` : ""}`;
    })
    .join("; ");
}

function invoiceDateFromRow(row: InvoiceDetailRow): string {
  if (row.issued_at) return String(row.issued_at).slice(0, 10);
  return String(row.created_at ?? "").slice(0, 10);
}

export function salesInvoiceAuditSnapshotFromDetail(
  detail: InvoiceDetailRow,
): Record<string, unknown> {
  const customer =
    detail.users?.name?.trim() ||
    detail.users?.company_name?.trim() ||
    detail.users?.email?.trim() ||
    detail.user_id;
  return {
    customer,
    invoice_date: invoiceDateFromRow(detail),
    due_date: detail.due_date ? String(detail.due_date).slice(0, 10) : null,
    reference: detail.reference ?? null,
    notes: detail.notes ?? null,
    discount: roundMoney(Number(detail.discount ?? 0)),
    total: roundMoney(Number(detail.total_amount ?? 0)),
    line_items: formatInvoiceLines(detail.invoice_items),
  };
}

export function salesInvoiceAuditSnapshotFromInput(input: {
  customerId: string;
  customerName?: string | null;
  invoiceDate: string;
  dueDate: string;
  reference?: string;
  notes?: string;
  discount?: number;
  totalAmount: number;
  lines: ErpLineInput[];
}): Record<string, unknown> {
  const pseudoLines = input.lines.map((line) => ({
    product_name: line.productName,
    quantity: line.quantity,
    unit_price: line.unitPrice,
    gst_rate: line.taxRatePercent,
  }));
  return {
    customer: input.customerName?.trim() || input.customerId,
    invoice_date: input.invoiceDate,
    due_date: input.dueDate,
    reference: input.reference ?? null,
    notes: input.notes ?? null,
    discount: roundMoney(input.discount ?? 0),
    total: roundMoney(input.totalAmount),
    line_items: formatInvoiceLines(pseudoLines),
  };
}
