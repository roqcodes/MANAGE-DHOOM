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
};

export function formatAuditActionLabel(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  return action
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatAuditEntityLabel(entityType: string): string {
  if (ENTITY_LABELS[entityType]) return ENTITY_LABELS[entityType];
  return entityType
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function auditLogEntityHref(log: AuditLogEntry): string | null {
  const id = log.entity_id;
  if (!id) return null;

  switch (log.entity_type) {
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
    case "customer_payment_batch":
      return `/admin/erp/customer-bulk-payments/${id}`;
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

export function formatAuditActivityTitle(log: AuditLogEntry): string {
  const action = formatAuditActionLabel(log.action);
  const entity = formatAuditEntityLabel(log.entity_type);
  return `${action} ${entity.toLowerCase()}`;
}
