import type { AuditLogEntry } from "@/common/erp/types";

export function formatAuditLogUser(log: AuditLogEntry): string {
  if (log.user_name?.trim()) return log.user_name.trim();
  if (log.user_email?.trim()) return log.user_email.trim();
  if (log.user_id) return log.user_id.slice(0, 8);
  return "Unknown user";
}

export function formatAuditLogUserDetail(log: AuditLogEntry): string {
  const name = log.user_name?.trim();
  const email = log.user_email?.trim();
  if (name && email) return `${name} (${email})`;
  return formatAuditLogUser(log);
}

const ENTITY_LABELS: Record<string, string> = {
  invoice: "Invoice",
  purchase_bill: "Purchase bill",
  estimate: "Estimate",
  credit_note: "Credit note",
  expense: "Expense",
  customer_payment: "Payment received",
  erp_payment: "Payment received",
  customer_payment_batch: "Bulk payment",
  supplier_payment_batch: "Bulk payment made",
  transfer_payment_bulk: "Transfer bulk payment",
  salary_bulk_payment: "Salary bulk payment",
  supplier_payment: "Payment made",
  vendor_credit: "Vendor credit",
  purchase_order: "Purchase order",
  order: "Online order",
  sales_order: "Sales order",
  product: "Product",
  customer: "Customer",
  vendor: "Vendor",
  journal_entry: "Journal entry",
  recurring_schedule: "Recurring schedule",
  store: "Store",
  stock_adjustment: "Stock adjustment",
  transfer_request: "Transfer request",
  store_transfer: "Store transfer",
};

const ACTION_LABELS: Record<string, string> = {
  create: "Created",
  update: "Updated",
  delete: "Deleted",
  finalize: "Finalized",
  finalize_purchase_bill: "Finalized",
  cancel: "Cancelled",
  email_sent: "Emailed",
  recurring_run: "Ran schedule",
  convert: "Converted",
  payment_received: "Payment received",
  supplier_payment: "Payment made",
  create_bulk_customer_payment: "Bulk payment received",
  create_bulk_supplier_payment: "Bulk payment made",
};

export function formatAuditActionLabel(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  return action
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Prefer friendly labels in tables; fall back to raw entity_type only when unknown. */
export function formatAuditEntityLabel(entityType: string): string {
  if (ENTITY_LABELS[entityType]) return ENTITY_LABELS[entityType];
  return entityType
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function batchHrefFromMetadata(
  metadata: Record<string, unknown> | undefined,
  entityId: string | null,
  prefix: string,
  basePath: string,
): string | null {
  const ref =
    (typeof metadata?.batch_ref === "string" && metadata.batch_ref) ||
    (typeof metadata?.reference === "string" && metadata.reference) ||
    null;
  const pathId = ref ?? (entityId ? `${prefix}${entityId}` : null);
  return pathId ? `${basePath}/${encodeURIComponent(pathId)}` : null;
}

export function auditLogEntityHref(log: AuditLogEntry): string | null {
  const id = log.entity_id;
  const metadata = log.metadata ?? {};

  switch (log.entity_type) {
    case "customer_payment_batch":
      return batchHrefFromMetadata(metadata, id, "CBPB:", "/admin/erp/customer-bulk-payments");
    case "supplier_payment_batch":
      return batchHrefFromMetadata(metadata, id, "BULK:", "/admin/erp/supplier-bulk-payments");
    case "transfer_payment_bulk": {
      const ref =
        (typeof metadata.batchRef === "string" && metadata.batchRef) ||
        (typeof metadata.reference === "string" && metadata.reference);
      return ref ? `/admin/erp/transfer-bulk-payments` : null;
    }
    case "salary_bulk_payment":
      return id ? `/admin/erp/salary-bulk-payments` : null;
    case "invoice":
      return `/admin/erp/invoices/${id}`;
    case "purchase_bill":
      return `/admin/erp/purchase-bills/${id}`;
    case "estimate":
      return `/admin/erp/estimates/${id}`;
    case "credit_note":
      return `/admin/erp/credit-notes/${id}`;
    case "expense":
      return `/admin/erp/expenses/${id}`;
    case "customer_payment":
    case "erp_payment":
      return `/admin/erp/payments/${id}`;
    case "supplier_payment":
      return `/admin/erp/supplier-payments/${id}`;
    case "vendor_credit":
      return `/admin/erp/vendor-credits/${id}`;
    case "purchase_order":
      return `/admin/purchase-orders/${id}`;
    case "order":
      return `/admin/orders/${id}`;
    case "sales_order":
      return `/admin/erp/sales-orders/${id}`;
    case "product":
      return `/admin/products/${id}`;
    case "customer":
      return `/admin/customers/${id}`;
    case "vendor":
      return `/admin/vendors/${id}/erp`;
    case "journal_entry":
      return `/admin/erp/journal-entries/${id}`;
    case "stock_adjustment":
      return `/admin/erp/stock-adjustments/${id}`;
    case "transfer_request":
      return `/admin/erp/transfer-requests/${id}`;
    case "store_transfer":
      return `/admin/erp/store-transfers/${id}`;
    default:
      return null;
  }
}

type AuditLogLike = Pick<AuditLogEntry, "action" | "metadata" | "description">;

function auditChangeLines(log: AuditLogLike): string[] {
  const raw = log.metadata?.changes;
  if (!Array.isArray(raw)) return [];
  return raw.filter((line): line is string => typeof line === "string" && line.trim().length > 0);
}

/** Full description for tables and panels (includes field-level edits when logged). */
export function formatAuditLogDescription(log: AuditLogLike): string {
  if (log.description?.trim()) return log.description.trim();
  const summary = log.metadata?.change_summary;
  if (typeof summary === "string" && summary.trim()) return summary.trim();
  return "";
}

/** Activity column / title: prefer first concrete change on updates. */
export function formatAuditActivityLabel(log: AuditLogLike): string {
  const changes = auditChangeLines(log);
  if (log.action === "update" && changes.length > 0) return changes[0];
  return formatAuditActionLabel(log.action);
}

export function formatAuditActivityTitle(log: AuditLogEntry): string {
  const changes = auditChangeLines(log);
  const entity = formatAuditEntityLabel(log.entity_type);
  if (log.action === "update" && changes.length > 0) {
    return `${entity}: ${changes[0]}`;
  }
  const action = formatAuditActionLabel(log.action);
  return `${action} ${entity.toLowerCase()}`;
}

export const AUDIT_ENTITY_FILTER_OPTIONS = Object.entries(ENTITY_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export const AUDIT_ACTION_FILTER_OPTIONS = [
  { value: "create", label: "Create" },
  { value: "update", label: "Edit" },
  { value: "delete", label: "Delete" },
  { value: "cancel", label: "Cancel" },
  { value: "finalize", label: "Finalize" },
  { value: "finalize_purchase_bill", label: "Finalize bill" },
  { value: "convert", label: "Convert" },
  { value: "email_sent", label: "Email sent" },
  { value: "payment_received", label: "Payment received" },
  { value: "supplier_payment", label: "Payment made" },
  { value: "create_bulk_customer_payment", label: "Bulk payment received" },
  { value: "create_bulk_supplier_payment", label: "Bulk payment made" },
];
