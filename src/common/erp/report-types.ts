export type ReportChannel = "all" | "erp" | "online";

export type ReportFilterConfig = {
  dateRange?: boolean;
  asOfDate?: boolean;
  store?: boolean;
  channel?: boolean;
  account?: boolean;
};

export type ReportColumn = {
  key: string;
  label: string;
  align?: "left" | "right";
  format?: "currency" | "number" | "date" | "text";
};

export type ReportDefinition = {
  slug: string;
  title: string;
  description: string;
  category: string;
  filters: ReportFilterConfig;
  columns: ReportColumn[];
  rpc: string;
  rowsKey?: string;
};

export const ERP_REPORT_CATEGORIES = [
  "Business Overview",
  "Sales",
  "Inventory",
  "Receivables",
  "Payments Received",
  "Payables",
  "Purchases and Expenses",
  "Accountant",
  "Activity",
] as const;

export const ERP_REPORTS: ReportDefinition[] = [
  {
    slug: "profit-and-loss",
    title: "Profit and Loss",
    description: "Income and expense accounts from posted journal entries.",
    category: "Business Overview",
    filters: { dateRange: true, store: true },
    rpc: "get_erp_profit_and_loss",
    columns: [
      { key: "account_code", label: "Account" },
      { key: "account_name", label: "Name" },
      { key: "amount", label: "Amount", align: "right", format: "currency" },
    ],
  },
  {
    slug: "trial-balance",
    title: "Trial Balance",
    description: "All account balances as of a date.",
    category: "Accountant",
    filters: { asOfDate: true, store: true },
    rpc: "get_erp_trial_balance",
    rowsKey: "rows",
    columns: [
      { key: "account_code", label: "Code" },
      { key: "account_name", label: "Account" },
      { key: "account_category", label: "Category" },
      { key: "period_debit", label: "Debit", align: "right", format: "currency" },
      { key: "period_credit", label: "Credit", align: "right", format: "currency" },
      { key: "balance", label: "Balance", align: "right", format: "currency" },
    ],
  },
  {
    slug: "general-ledger",
    title: "General Ledger",
    description: "Account-wise journal lines with running balance.",
    category: "Accountant",
    filters: { dateRange: true, store: true, account: true },
    rpc: "get_erp_general_ledger",
    rowsKey: "rows",
    columns: [
      { key: "transaction_date", label: "Date", format: "date" },
      { key: "journal_number", label: "Journal #" },
      { key: "line_description", label: "Description" },
      { key: "debit_amount", label: "Debit", align: "right", format: "currency" },
      { key: "credit_amount", label: "Credit", align: "right", format: "currency" },
      { key: "running_balance", label: "Balance", align: "right", format: "currency" },
    ],
  },
  {
    slug: "day-book",
    title: "Day Book",
    description: "Cash and bank account transactions.",
    category: "Business Overview",
    filters: { dateRange: true, store: true },
    rpc: "get_erp_day_book",
    columns: [
      { key: "transaction_date", label: "Date", format: "date" },
      { key: "transaction_number", label: "Number" },
      { key: "account_name", label: "Account" },
      { key: "details", label: "Details" },
      { key: "debit_amount", label: "Debit", align: "right", format: "currency" },
      { key: "credit_amount", label: "Credit", align: "right", format: "currency" },
    ],
  },
  {
    slug: "finance-summary",
    title: "Finance Summary",
    description: "AR, AP, YTD metrics and daily sales trend.",
    category: "Business Overview",
    filters: { store: true },
    rpc: "get_erp_financial_dashboard",
    columns: [],
  },
  {
    slug: "sales-by-customer",
    title: "Sales by Customer",
    description: "Invoice totals grouped by customer. Filter by store and channel.",
    category: "Sales",
    filters: { dateRange: true, store: true, channel: true },
    rpc: "get_erp_sales_by_customer",
    columns: [
      { key: "customer_name", label: "Customer" },
      { key: "channel", label: "Channel" },
      { key: "invoice_count", label: "Invoices", align: "right", format: "number" },
      { key: "total_sales", label: "Sales", align: "right", format: "currency" },
      { key: "balance_due", label: "Balance due", align: "right", format: "currency" },
    ],
  },
  {
    slug: "sales-by-item",
    title: "Sales by Item",
    description: "Line-item sales totals. ERP store vs online channel.",
    category: "Sales",
    filters: { dateRange: true, store: true, channel: true },
    rpc: "get_erp_sales_by_item",
    columns: [
      { key: "product_name", label: "Product" },
      { key: "channel", label: "Channel" },
      { key: "total_qty", label: "Qty", align: "right", format: "number" },
      { key: "total_amount", label: "Amount", align: "right", format: "currency" },
      { key: "total_tax", label: "Tax", align: "right", format: "currency" },
    ],
  },
  {
    slug: "credit-note-report",
    title: "Credit Note Report",
    description: "Credit notes issued in the period.",
    category: "Sales",
    filters: { dateRange: true, store: true },
    rpc: "get_erp_credit_note_report",
    columns: [
      { key: "credit_note_number", label: "CN #" },
      { key: "credit_note_date", label: "Date", format: "date" },
      { key: "customer_name", label: "Customer" },
      { key: "total_amount", label: "Amount", align: "right", format: "currency" },
      { key: "status", label: "Status" },
    ],
  },
  {
    slug: "item-stock",
    title: "Item Stock Report",
    description: "Per-store stock with available qty and valuation.",
    category: "Inventory",
    filters: { store: true },
    rpc: "get_erp_item_stock_report",
    columns: [
      { key: "product_name", label: "Product" },
      { key: "store_name", label: "Store" },
      { key: "stock", label: "On hand", align: "right", format: "number" },
      { key: "available_stock", label: "Available", align: "right", format: "number" },
      { key: "incoming_qty", label: "Incoming", align: "right", format: "number" },
      { key: "expected_stock", label: "Expected", align: "right", format: "number" },
      { key: "purchase_price", label: "Cost", align: "right", format: "currency" },
    ],
  },
  {
    slug: "store-wise-stock",
    title: "Store Wise Stock",
    description: "Stock totals and value by store.",
    category: "Inventory",
    filters: {},
    rpc: "get_erp_store_wise_stock_report",
    columns: [
      { key: "store_name", label: "Store" },
      { key: "sku_count", label: "SKUs", align: "right", format: "number" },
      { key: "total_stock", label: "Units", align: "right", format: "number" },
      { key: "stock_value_at_cost", label: "Value at cost", align: "right", format: "currency" },
    ],
  },
  {
    slug: "customer-balance",
    title: "Customer Balance",
    description: "Outstanding receivables per customer.",
    category: "Receivables",
    filters: { store: true },
    rpc: "get_erp_customer_balance_report",
    columns: [
      { key: "customer_name", label: "Customer" },
      { key: "opening_balance", label: "Opening", align: "right", format: "currency" },
      { key: "balance_due", label: "Invoice due", align: "right", format: "currency" },
      { key: "total_receivable", label: "Total", align: "right", format: "currency" },
    ],
  },
  {
    slug: "customer-aging",
    title: "Aging Summary (Customers)",
    description: "Invoice balances by aging bucket.",
    category: "Receivables",
    filters: { asOfDate: true, store: true },
    rpc: "get_erp_customer_aging",
    columns: [
      { key: "customer_name", label: "Customer" },
      { key: "bucket_0_30", label: "0–30", align: "right", format: "currency" },
      { key: "bucket_31_60", label: "31–60", align: "right", format: "currency" },
      { key: "bucket_61_90", label: "61–90", align: "right", format: "currency" },
      { key: "bucket_90_plus", label: "90+", align: "right", format: "currency" },
      { key: "total_due", label: "Total", align: "right", format: "currency" },
    ],
  },
  {
    slug: "payments-received",
    title: "Payments Received",
    description: "Customer payments in the period.",
    category: "Payments Received",
    filters: { dateRange: true, store: true },
    rpc: "get_erp_payments_received_report",
    columns: [
      { key: "payment_date", label: "Date", format: "date" },
      { key: "payment_number", label: "Payment #" },
      { key: "customer_name", label: "Customer" },
      { key: "payment_mode", label: "Mode" },
      { key: "total_amount", label: "Amount", align: "right", format: "currency" },
    ],
  },
  {
    slug: "vendor-balance",
    title: "Vendor Balance",
    description: "Outstanding payables per vendor.",
    category: "Payables",
    filters: { store: true },
    rpc: "get_erp_vendor_balance_report",
    columns: [
      { key: "vendor_name", label: "Vendor" },
      { key: "open_bills", label: "Open bills", align: "right", format: "number" },
      { key: "balance_due", label: "Balance due", align: "right", format: "currency" },
    ],
  },
  {
    slug: "vendor-aging",
    title: "Aging Summary (Vendors)",
    description: "Purchase bill balances by aging bucket.",
    category: "Payables",
    filters: { asOfDate: true, store: true },
    rpc: "get_erp_vendor_aging",
    columns: [
      { key: "vendor_name", label: "Vendor" },
      { key: "bucket_0_30", label: "0–30", align: "right", format: "currency" },
      { key: "bucket_31_60", label: "31–60", align: "right", format: "currency" },
      { key: "bucket_61_90", label: "61–90", align: "right", format: "currency" },
      { key: "bucket_90_plus", label: "90+", align: "right", format: "currency" },
      { key: "total_due", label: "Total", align: "right", format: "currency" },
    ],
  },
  {
    slug: "activity-logs",
    title: "Activity Logs",
    description: "Recent admin audit events.",
    category: "Activity",
    filters: { dateRange: true, store: true },
    rpc: "audit_logs_list",
    columns: [
      { key: "created_at", label: "When", format: "date" },
      { key: "user_name", label: "User" },
      { key: "action", label: "Action" },
      { key: "entity_type", label: "Entity" },
      { key: "description", label: "Details" },
    ],
  },
];

export function getReportBySlug(slug: string): ReportDefinition | undefined {
  return ERP_REPORTS.find((r) => r.slug === slug);
}

export function getReportsByCategory(): Record<string, ReportDefinition[]> {
  const map: Record<string, ReportDefinition[]> = {};
  for (const cat of ERP_REPORT_CATEGORIES) {
    map[cat] = ERP_REPORTS.filter((r) => r.category === cat);
  }
  return map;
}

export function extractReportRows(data: unknown, rowsKey?: string): Record<string, unknown>[] {
  if (!data) return [];
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (typeof data !== "object") return [];

  const obj = data as Record<string, unknown>;

  if (rowsKey && Array.isArray(obj[rowsKey])) {
    return obj[rowsKey] as Record<string, unknown>[];
  }

  if (Array.isArray(obj.rows)) return obj.rows as Record<string, unknown>[];
  if (Array.isArray(obj.income) || Array.isArray(obj.expenses)) {
    const income = (obj.income as Record<string, unknown>[] | undefined)?.map((r) => ({
      ...r,
      section: "Income",
    })) ?? [];
    const expenses = (obj.expenses as Record<string, unknown>[] | undefined)?.map((r) => ({
      ...r,
      section: "Expense",
    })) ?? [];
    return [...income, ...expenses];
  }

  return [];
}
