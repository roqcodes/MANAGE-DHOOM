/** Shared ERP extension types — org context, accounting refs, audit primitives. */

export const ACCOUNT_CATEGORIES = [
  "Assets",
  "Liability",
  "Equity",
  "Income",
  "Expense",
  "AccountsPayable",
  "AccountsRecievable",
] as const;

export type AccountCategory = (typeof ACCOUNT_CATEGORIES)[number];

export const ERP_DOCUMENT_TYPES = [
  "sales_invoice",
  "sales_order",
  "estimate",
  "credit_note",
  "purchase_bill",
  "purchase_order",
  "vendor_credit",
  "expense",
  "payment_received",
  "payment_made",
  "stock_adjustment",
  "stock_transfer",
  "transfer_request",
  "transfer_payment",
] as const;

export type ErpDocumentType = (typeof ERP_DOCUMENT_TYPES)[number];

export type ErpEmailDocumentType =
  | "invoice"
  | "estimate"
  | "credit_note"
  | "payment"
  | "purchase_bill"
  | "payment_receipt";

/** Winner ERP activity-log action labels observed in dashboard screenshots. */
export const AUDIT_ACTIONS = [
  "create",
  "update",
  "delete",
  "create_invoice",
  "edit_invoice",
  "payment_received",
  "create_bulk_customer_payment",
  "create_bulk_customer_payment",
  "create_purchase_bill",
  "finalize_purchase_bill",
  "supplier_payment",
  "create_bulk_supplier_payment",
  "vendor_credit",
  "create_expense",
  "stock_adjustment",
  "stock_transfer",
  "login",
  "logout",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface Company {
  id: string;
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export type RecurringScheduleFrequency = "weekly" | "monthly" | "quarterly" | "yearly";

export type RecurringScheduleRow = {
  id: string;
  schedule_type: "invoice" | "purchase_bill";
  name: string;
  store_id: string | null;
  customer_id: string | null;
  vendor_id: string | null;
  frequency: RecurringScheduleFrequency;
  next_run_date: string;
  last_run_date: string | null;
  is_active: boolean;
  payload: Record<string, unknown>;
  created_at: string;
  customer_name?: string | null;
  vendor_name?: string | null;
};

export interface Store {
  id: string;
  company_id: string;
  name: string;
  code: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  phone: string | null;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  description?: string | null;
  store_type?: string | null;
  markup_percent?: number;
  country?: string | null;
  currency?: string | null;
  trn?: string | null;
  tax_template?: string | null;
  logo_url?: string | null;
}

export interface UserStoreAccess {
  user_id: string;
  store_id: string;
  is_default: boolean;
  created_at: string;
}

export interface ItemUnit {
  id: string;
  name: string;
  abbreviation: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface AccountType {
  id: string;
  account_category: AccountCategory;
  name: string;
  description: string;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface Account {
  id: string;
  account_type_id: string;
  store_id: string | null;
  name: string;
  description: string;
  code: string;
  is_system: boolean;
  is_locked: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuditLogEntry {
  id: string;
  user_id: string | null;
  user_name?: string | null;
  user_email?: string | null;
  user_role?: string | null;
  store_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
}

export interface ErpDocumentSequence {
  document_type: ErpDocumentType;
  prefix: string;
  next_number: number;
  padding: number;
  updated_at: string;
}

export interface ErpContextStore {
  id: string;
  name: string;
  code: string | null;
  company_id: string;
}

export interface ErpContextCompany {
  id: string;
  name: string;
  legal_name: string | null;
  tax_id: string | null;
}

/** Resolved org context for ERP screens and audit attribution. */
export interface ErpContext {
  store_id: string | null;
  company_id: string | null;
  store: ErpContextStore | null;
  company: ErpContextCompany | null;
}

export interface LogAuditEventInput {
  action: AuditAction | string;
  entityType: string;
  entityId?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown>;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
  storeId?: string | null;
  userId?: string | null;
}
