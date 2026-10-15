import { AI_READONLY_VIEWS } from "./sql-guard";

export const AI_VIEW_COLUMNS: Record<string, string> = {
  ai_v_invoices:
    "id, invoice_number, status, source, issued_at, created_at, due_date, subtotal, gst_amount, discount, total_amount, amount_paid, balance_due, store_id, store_name, customer_id, customer_name, salesman_id, salesman_name",
  ai_v_invoice_lines:
    "line_id, invoice_id, invoice_number, issued_at, invoice_status, customer_name, salesman_name, product_id, product_name, quantity, unit_price, line_total, store_name",
  ai_v_purchase_bills:
    "id, purchase_bill_number, vendor_bill_number, status, purchase_date, created_at, updated_at, due_date, total_amount, amount_paid, balance_due, store_name, vendor_name, created_by_name",
  ai_v_purchase_bill_lines:
    "line_id, purchase_bill_id, purchase_bill_number, purchase_date, vendor_name, product_name, quantity, purchase_price, line_total",
  ai_v_customers:
    "id, name, company_name, contact_display_name, customer_number, phone, created_at",
  ai_v_team:
    "id, name, role, is_verified",
  ai_v_products:
    "id, name, is_active, item_type, price, purchase_price, barcode, brand_name, category_name",
  ai_v_audit:
    "id, created_at, action, entity_type, entity_id, description, actor_name, actor_role, store_name",
};

export function describeReadonlySchema() {
  return {
    views: AI_READONLY_VIEWS.map((name) => ({
      name,
      columns: AI_VIEW_COLUMNS[name] ?? "",
    })),
    rules: [
      "SELECT/WITH only, single statement, LIMIT <= 50.",
      "Join only these views.",
      "Asia/Dubai calendar for 'this month' unless the user specifies otherwise.",
      "Exclude invoices/bills with status cancelled unless asked.",
    ],
  };
}
