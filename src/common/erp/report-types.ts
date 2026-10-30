export type ReportChannel = "all" | "erp" | "online";

export type ReportFilterConfig = {
  dateRange?: boolean;
  asOfDate?: boolean;
  store?: boolean;
  channel?: boolean;
  account?: boolean;
  brand?: boolean;
  category?: boolean;
  stockLevel?: boolean;
  fromStore?: boolean;
  toStore?: boolean;
  status?: boolean;
  entityType?: boolean;
  activityAction?: boolean;
  activityUser?: boolean;
  customerSearch?: boolean;
  vendorSearch?: boolean;
  storeSearch?: boolean;
  accountType?: boolean;
  /** Filter open documents by days past due (min/max). */
  ageRange?: boolean;
  /** Filter by ERP salesman (invoice sales_person_id / activity attribution). */
  salesman?: boolean;
  /** City → street → mall on customer default address (serial filters). */
  addressHierarchy?: boolean;
  /** Dead stock: days since expiry (min/max). */
  expiredDaysRange?: boolean;
  /** Dead stock / expiry: expiring-soon window (days). */
  expiryWindowDays?: boolean;
};

export type ReportStockLevel = "all" | "in_stock" | "out_of_stock" | "low_stock";

export type ReportColumn = {
  key: string;
  label: string;
  align?: "left" | "right";
  format?: "currency" | "number" | "date" | "text" | "percent";
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
  "Taxes",
  "Activity",
] as const;

export const ERP_REPORTS: ReportDefinition[] = [
  {
    slug: "balance-sheet",
    title: "Balance Sheet",
    description: "Assets, liabilities, and equity balances as of a date.",
    category: "Business Overview",
    filters: { asOfDate: true, store: true },
    rpc: "get_erp_trial_balance",
    rowsKey: "rows",
    columns: [
      { key: "account_code", label: "Code" },
      { key: "account_name", label: "Account" },
      { key: "account_type_name", label: "Type" },
      { key: "balance", label: "Balance", align: "right", format: "currency" },
    ],
  },
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
    description: "Closing debit or credit by account as of a date, grouped by category.",
    category: "Accountant",
    filters: { asOfDate: true, store: true },
    rpc: "get_erp_trial_balance",
    rowsKey: "rows",
    columns: [
      { key: "account_name", label: "Account" },
      { key: "period_debit", label: "Debit", align: "right", format: "currency" },
      { key: "period_credit", label: "Credit", align: "right", format: "currency" },
    ],
  },
  {
    slug: "general-ledger",
    title: "General Ledger",
    description: "Period activity and balance by account; optional drill-down to journal lines.",
    category: "Accountant",
    filters: { dateRange: true, store: true, account: true },
    rpc: "get_erp_general_ledger_summary",
    rowsKey: "rows",
    columns: [
      { key: "account_name", label: "Account name" },
      { key: "period_credit", label: "Credit", align: "right", format: "currency" },
      { key: "period_debit", label: "Debit", align: "right", format: "currency" },
      { key: "balance", label: "Balance", align: "right", format: "currency" },
    ],
  },
  {
    slug: "account-transactions",
    title: "Account Transactions",
    description: "Posted journal lines with store, account, type, and debit/credit amounts.",
    category: "Accountant",
    filters: { dateRange: true, store: true, account: true, accountType: true },
    rpc: "get_erp_account_transaction_report",
    columns: [
      { key: "transaction_date", label: "Date", format: "date" },
      { key: "transaction_number", label: "Transaction #" },
      { key: "store_name", label: "Store" },
      { key: "account_name", label: "Account" },
      { key: "transaction_details", label: "Transaction details" },
      { key: "transaction_type", label: "Transaction type" },
      { key: "reference_number", label: "Reference #" },
      { key: "debit_amount", label: "Debit", align: "right", format: "currency" },
      { key: "credit_amount", label: "Credit", align: "right", format: "currency" },
      { key: "amount_side", label: "Amount", align: "right", format: "text" },
    ],
  },
  {
    slug: "ar-ap-recon",
    title: "AR/AP GL Reconciliation",
    description: "Control accounts vs subledger (open documents, unallocated, unapplied credits, store openings). Variance should be zero.",
    category: "Accountant",
    filters: { asOfDate: true, store: true },
    rpc: "get_erp_ar_ap_gl_recon_report",
    columns: [
      { key: "control", label: "Control" },
      { key: "as_of", label: "As of", format: "date" },
      { key: "gl_balance", label: "GL", align: "right", format: "currency" },
      { key: "party_openings", label: "Openings", align: "right", format: "currency" },
      { key: "open_documents", label: "Open docs", align: "right", format: "currency" },
      { key: "unallocated", label: "Unallocated", align: "right", format: "currency" },
      { key: "unapplied_credits", label: "Unapplied credits", align: "right", format: "currency" },
      { key: "subledger", label: "Subledger", align: "right", format: "currency" },
      { key: "variance", label: "Variance", align: "right", format: "currency" },
    ],
  },
  {
    slug: "cash-flow-statement",
    title: "Cash Flow Statement",
    description: "Indirect cash flow from operating, investing, and financing activities.",
    category: "Business Overview",
    filters: { dateRange: true, store: true },
    rpc: "get_erp_cash_flow_statement",
    columns: [],
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
      { key: "transaction_type", label: "Type" },
      { key: "account_name", label: "Account" },
      { key: "counter_account_name", label: "Counter account" },
      { key: "store_name", label: "Store" },
      { key: "details", label: "Details" },
      { key: "debit_amount", label: "Debit", align: "right", format: "currency" },
      { key: "credit_amount", label: "Credit", align: "right", format: "currency" },
      { key: "running_balance", label: "Balance", align: "right", format: "currency" },
    ],
  },
  {
    slug: "finance-summary",
    title: "Finance Summary",
    description: "Position snapshot (assets vs liabilities) with AR, AP, and period P&L metrics.",
    category: "Business Overview",
    filters: { dateRange: true, store: true },
    rpc: "get_erp_financial_dashboard",
    columns: [],
  },
  {
    slug: "performance-report",
    title: "Performance Report",
    description:
      "At-a-glance sales, margin, collections, AR/AP, and ranked leaders and laggards for items, salespeople, customers, vendors, brands, and categories.",
    category: "Business Overview",
    filters: {
      dateRange: true,
      store: true,
      channel: true,
      salesman: true,
      customerSearch: true,
    },
    rpc: "get_erp_performance_dashboard",
    columns: [],
  },
  {
    slug: "daily-collection-report",
    title: "Daily Collection Report",
    description: "Per-day invoice totals and customer payments by mode.",
    category: "Sales",
    filters: { dateRange: true, store: true },
    rpc: "get_erp_daily_collection_report",
    columns: [
      { key: "report_date", label: "Date", format: "date" },
      { key: "invoice_count", label: "Invoices", align: "right", format: "number" },
      { key: "net_total", label: "Net total", align: "right", format: "currency" },
      { key: "tax", label: "Tax", align: "right", format: "currency" },
      { key: "total_discount", label: "Discount", align: "right", format: "currency" },
      { key: "cash_payment", label: "Cash", align: "right", format: "currency" },
      { key: "card_payment", label: "Card", align: "right", format: "currency" },
      { key: "check_payment", label: "Check", align: "right", format: "currency" },
      { key: "bank_transfer", label: "Bank transfer", align: "right", format: "currency" },
      { key: "bank_remittance", label: "Bank remittance", align: "right", format: "currency" },
      { key: "total_payment", label: "Total payment", align: "right", format: "currency" },
      { key: "balance", label: "Balance", align: "right", format: "currency" },
    ],
  },
  {
    slug: "monthly-collection-report",
    title: "Monthly Collection Report",
    description: "Monthly invoice and collection totals with period boundaries.",
    category: "Sales",
    filters: { dateRange: true, store: true },
    rpc: "get_erp_monthly_collection_report",
    columns: [
      { key: "month_label", label: "Month" },
      { key: "period_from", label: "From", format: "date" },
      { key: "period_to", label: "To", format: "date" },
      { key: "days_in_period", label: "Days", align: "right", format: "number" },
      { key: "invoice_count", label: "Invoices", align: "right", format: "number" },
      { key: "net_total", label: "Net total", align: "right", format: "currency" },
      { key: "tax", label: "Tax", align: "right", format: "currency" },
      { key: "total_discount", label: "Discount", align: "right", format: "currency" },
      { key: "cash_payment", label: "Cash", align: "right", format: "currency" },
      { key: "card_payment", label: "Card", align: "right", format: "currency" },
      { key: "check_payment", label: "Check", align: "right", format: "currency" },
      { key: "bank_transfer", label: "Bank transfer", align: "right", format: "currency" },
      { key: "bank_remittance", label: "Bank remittance", align: "right", format: "currency" },
      { key: "total_payment", label: "Total payment", align: "right", format: "currency" },
      { key: "balance", label: "Balance", align: "right", format: "currency" },
    ],
  },
  {
    slug: "sales-by-customer",
    title: "Sales by Customer",
    description:
      "Invoice totals, margin, and profit by customer. Net sales (ex tax) is after prorated header discount on lines. Filter by store and channel.",
    category: "Sales",
    filters: { dateRange: true, store: true, channel: true, salesman: true },
    rpc: "get_erp_sales_by_customer",
    columns: [
      { key: "customer_name", label: "Customer" },
      { key: "invoice_count", label: "Invoices", align: "right", format: "number" },
      { key: "sales_with_tax", label: "Sales (with tax)", align: "right", format: "currency" },
      { key: "total_discount", label: "Discount", align: "right", format: "currency" },
      { key: "tax", label: "Tax", align: "right", format: "currency" },
      { key: "net_sales_value", label: "Net sales", align: "right", format: "currency" },
      { key: "purchase_cost", label: "COGS (recognized)", align: "right", format: "currency" },
      { key: "uncosted_revenue", label: "Pending cost (revenue)", align: "right", format: "currency" },
      { key: "net_profit", label: "Recognized profit", align: "right", format: "currency" },
      { key: "profit_percent", label: "Profit %", align: "right", format: "number" },
      { key: "channel", label: "Channel" },
    ],
  },
  {
    slug: "sales-by-item",
    title: "Sales by Item",
    description:
      "Line-item sales, cost, and profit after prorated header discount on net sales (ex tax). ERP store vs online channel.",
    category: "Sales",
    filters: { dateRange: true, store: true, channel: true, salesman: true },
    rpc: "get_erp_sales_by_item",
    columns: [
      { key: "product_name", label: "Item" },
      { key: "total_qty", label: "Qty sold", align: "right", format: "number" },
      { key: "net_sales_ex_tax", label: "Net sales (ex tax)", align: "right", format: "currency" },
      { key: "total_amount", label: "Sales (incl. tax)", align: "right", format: "currency" },
      { key: "total_tax", label: "Tax", align: "right", format: "currency" },
      { key: "purchase_cost", label: "COGS (recognized)", align: "right", format: "currency" },
      { key: "uncosted_revenue", label: "Pending cost (revenue)", align: "right", format: "currency" },
      { key: "profit", label: "Recognized profit", align: "right", format: "currency" },
      { key: "channel", label: "Channel" },
    ],
  },
  {
    slug: "sales-by-salesman",
    title: "Sales by Salesman",
    description: "Invoices, credit notes, cost, and profit by sales person.",
    category: "Sales",
    filters: { dateRange: true, store: true, channel: true, salesman: true },
    rpc: "get_erp_sales_by_salesman",
    columns: [
      { key: "salesman_name", label: "Name" },
      { key: "invoice_count", label: "Invoices", align: "right", format: "number" },
      { key: "total_sales", label: "Total sales", align: "right", format: "currency" },
      { key: "total_sales_without_tax", label: "Sales (ex tax)", align: "right", format: "currency" },
      { key: "credit_note_count", label: "CN count", align: "right", format: "number" },
      { key: "credit_note_total", label: "CN total", align: "right", format: "currency" },
      { key: "purchase_cost", label: "COGS (recognized)", align: "right", format: "currency" },
      { key: "uncosted_revenue", label: "Pending cost (revenue)", align: "right", format: "currency" },
      { key: "profit", label: "Recognized profit", align: "right", format: "currency" },
      { key: "profit_percent", label: "Profit %", align: "right", format: "number" },
    ],
  },
  {
    slug: "credit-note-report",
    title: "Credit Note Report",
    description: "Credit notes issued in the period.",
    category: "Sales",
    filters: { dateRange: true, store: true, salesman: true },
    rpc: "get_erp_credit_note_report",
    columns: [
      { key: "credit_note_date", label: "Date", format: "date" },
      { key: "credit_note_number", label: "Credit note #" },
      { key: "store_name", label: "Store" },
      { key: "reference", label: "Reference #" },
      { key: "customer_name", label: "Customer" },
      { key: "invoice_number", label: "Invoice #" },
      { key: "status", label: "Status" },
      { key: "amount_without_tax", label: "Amount (ex tax)", align: "right", format: "currency" },
      { key: "tax", label: "Tax", align: "right", format: "currency" },
      { key: "total_amount", label: "Amount", align: "right", format: "currency" },
    ],
  },
  {
    slug: "minus-stock",
    title: "Minus Stock Report",
    description: "Products with negative on-hand quantity by store (oversold or adjustment).",
    category: "Inventory",
    filters: { store: true, brand: true, category: true },
    rpc: "get_erp_minus_stock_report",
    columns: [
      { key: "product_code", label: "Code" },
      { key: "product_name", label: "Name" },
      { key: "category_name", label: "Category" },
      { key: "brand_name", label: "Brand" },
      { key: "store_name", label: "Store" },
      { key: "stock", label: "Stock", align: "right", format: "number" },
      { key: "shortage_qty", label: "Shortage", align: "right", format: "number" },
      { key: "shortage_cost", label: "Shortage cost", align: "right", format: "currency" },
      { key: "stock_purchase_value", label: "Purchase value", align: "right", format: "currency" },
      { key: "stock_sales_value", label: "Sales value", align: "right", format: "currency" },
    ],
  },
  {
    slug: "item-stock",
    title: "Stock Report",
    description: "On-hand stock, valuation, and inbound qty by product and store.",
    category: "Inventory",
    filters: { store: true, brand: true, category: true, stockLevel: true },
    rpc: "get_erp_item_stock_report",
    columns: [
      { key: "product_code", label: "Code" },
      { key: "product_name", label: "Name" },
      { key: "category_name", label: "Category" },
      { key: "brand_name", label: "Brand" },
      { key: "store_name", label: "Store" },
      { key: "stock", label: "Stock", align: "right", format: "number" },
      { key: "stock_status", label: "Status" },
      { key: "stock_purchase_value", label: "Stock purchase value", align: "right", format: "currency" },
      { key: "stock_sales_value", label: "Stock sales value", align: "right", format: "currency" },
      { key: "incoming_qty", label: "Incoming", align: "right", format: "number" },
      { key: "expected_stock", label: "Expected", align: "right", format: "number" },
    ],
  },
  {
    slug: "stock-gl-recon",
    title: "Stock GL vs WAC",
    description: "STOCK account balance versus on-hand quantity times store WAC (purchase price).",
    category: "Inventory",
    filters: { store: true },
    rpc: "get_erp_stock_gl_wac_recon_report",
    columns: [
      { key: "account_code", label: "Account" },
      { key: "account_name", label: "Name" },
      { key: "gl_balance", label: "GL", align: "right", format: "currency" },
      { key: "wac_value", label: "WAC value", align: "right", format: "currency" },
      { key: "variance", label: "Variance", align: "right", format: "currency" },
    ],
  },
  {
    slug: "store-wise-stock",
    title: "Store Wise Stock",
    description:
      "On-hand units and value at cost (WAC) for each active store from store inventory.",
    category: "Inventory",
    filters: { store: true },
    rpc: "get_erp_store_wise_stock_report",
    columns: [
      { key: "store_name", label: "Store" },
      { key: "sku_count", label: "SKUs", align: "right", format: "number" },
      { key: "total_stock", label: "Units", align: "right", format: "number" },
      { key: "stock_value_at_cost", label: "Value at cost", align: "right", format: "currency" },
    ],
  },
  {
    slug: "dead-stock",
    title: "Expiry & Dead Stock",
    description:
      "Expired on-hand stock and lots expiring soon, with estimated quantities from purchase bill and receive expiry dates.",
    category: "Inventory",
    filters: {
      asOfDate: true,
      store: true,
      brand: true,
      category: true,
      customerSearch: true,
      expiredDaysRange: true,
      expiryWindowDays: true,
    },
    rpc: "get_erp_dead_stock_report",
    columns: [
      { key: "product_code", label: "Item code" },
      { key: "product_name", label: "Item name" },
      { key: "category_name", label: "Category" },
      { key: "brand_name", label: "Brand" },
      { key: "store_name", label: "Store" },
      { key: "expiry_date", label: "Expiry date", format: "date" },
      { key: "days_expired", label: "Days expired", align: "right", format: "number" },
      { key: "days_to_expiry", label: "Days to expiry", align: "right", format: "number" },
      { key: "quantity", label: "Est. on-hand qty", align: "right", format: "number" },
      { key: "purchase_price", label: "Unit cost", align: "right", format: "currency" },
      { key: "stock_purchase_value", label: "Value at cost", align: "right", format: "currency" },
      { key: "source_ref", label: "Source document" },
      { key: "source_type", label: "Source type" },
    ],
  },
  {
    slug: "stock-transfer-report",
    title: "Stock Transfer Report",
    description: "Transfer requests with quantities, value, and status.",
    category: "Inventory",
    filters: { dateRange: true, fromStore: true, toStore: true, status: true },
    rpc: "get_erp_stock_transfer_report",
    columns: [
      { key: "request_date", label: "Date", format: "date" },
      { key: "request_number", label: "Transfer #" },
      { key: "requested_by", label: "Requested by" },
      { key: "from_store", label: "From store" },
      { key: "to_store", label: "To store" },
      { key: "requested_qty", label: "Req qty", align: "right", format: "number" },
      { key: "approved_qty", label: "Apr qty", align: "right", format: "number" },
      { key: "received_qty", label: "Rec qty", align: "right", format: "number" },
      { key: "requested_items_price", label: "Items price", align: "right", format: "currency" },
      { key: "status", label: "Status" },
      { key: "payment_paid", label: "Paid", align: "right", format: "currency" },
      { key: "payment_balance", label: "Balance", align: "right", format: "currency" },
    ],
  },
  {
    slug: "purchase-by-item",
    title: "Purchase By Item",
    description:
      "Purchase and inbound transfer quantities and values by product. Purchase value is line extension plus allocated landed costs (ex tax), before bill-level discount—not net acquisition cost.",
    category: "Purchases and Expenses",
    filters: { dateRange: true, store: true, brand: true, category: true },
    rpc: "get_erp_purchase_by_item_report",
    columns: [
      { key: "item_name", label: "Item name" },
      { key: "category_name", label: "Category" },
      { key: "brand_name", label: "Brand" },
      { key: "purchase_qty", label: "Purchase qty", align: "right", format: "number" },
      { key: "transfer_qty", label: "Transfer qty", align: "right", format: "number" },
      { key: "total_qty", label: "Total qty", align: "right", format: "number" },
      {
        key: "purchase_value",
        label: "Gross purchase value (before bill discount)",
        align: "right",
        format: "currency",
      },
      { key: "transfer_value", label: "Transfer value", align: "right", format: "currency" },
      {
        key: "total_value",
        label: "Gross total (before bill discount)",
        align: "right",
        format: "currency",
      },
      {
        key: "avg_purchase_cost",
        label: "Avg. gross unit cost (before discount)",
        align: "right",
        format: "currency",
      },
    ],
  },
  {
    slug: "expense-report",
    title: "Expense Report",
    description:
      "Recorded expenses by category, vendor, paid-through account, and billing status — with tax, totals, and a transaction register.",
    category: "Purchases and Expenses",
    filters: { dateRange: true, store: true },
    rpc: "get_erp_expense_report",
    rowsKey: "details",
    columns: [
      { key: "expense_date", label: "Date", format: "date" },
      { key: "expense_number", label: "Expense #" },
      { key: "account_name", label: "Category" },
      { key: "vendor_name", label: "Vendor" },
      { key: "paid_through_name", label: "Paid through" },
      { key: "customer_name", label: "Customer" },
      { key: "billing_status", label: "Status" },
      { key: "untaxed_amount", label: "Untaxed", align: "right", format: "currency" },
      { key: "tax_amount", label: "Tax", align: "right", format: "currency" },
      { key: "total_amount", label: "Total", align: "right", format: "currency" },
    ],
  },
  {
    slug: "purchase-by-vendor",
    title: "Purchase By Vendor",
    description: "Expense, bill, and vendor credit activity by vendor in the selected period.",
    category: "Purchases and Expenses",
    filters: { dateRange: true, store: true },
    rpc: "get_erp_purchase_by_vendor_report",
    columns: [
      { key: "vendor_name", label: "Vendor name" },
      { key: "expense_count", label: "Expense count", align: "right", format: "number" },
      { key: "bill_count", label: "Bill count", align: "right", format: "number" },
      { key: "vendor_credit_count", label: "Vendor credit count", align: "right", format: "number" },
      { key: "expense_amount", label: "Expense amount", align: "right", format: "currency" },
      { key: "bill_amount", label: "Bill amount", align: "right", format: "currency" },
      { key: "vendor_credit_amount", label: "Vendor credits", align: "right", format: "currency" },
      { key: "total", label: "Net total", align: "right", format: "currency" },
    ],
  },
  {
    slug: "customer-balance",
    title: "Customer Balance",
    description: "Opening + invoice due − unallocated payments. Zero and negative amounts are shown.",
    category: "Receivables",
    filters: { store: true, customerSearch: true, salesman: true },
    rpc: "get_erp_customer_balance_report",
    columns: [
      { key: "customer_name", label: "Customer" },
      { key: "phone", label: "Phone" },
      { key: "opening_balance", label: "Opening", align: "right", format: "currency" },
      { key: "unallocated_amount", label: "Unallocated", align: "right", format: "currency" },
      { key: "total_receivable", label: "Balance", align: "right", format: "currency" },
    ],
  },
  {
    slug: "customer-statement",
    title: "Customer Statement",
    description: "Chronological invoices, payments, and credit notes with running balance for this store.",
    category: "Receivables",
    filters: { dateRange: true, store: true, customerSearch: true },
    rpc: "get_erp_customer_statement_report",
    columns: [
      { key: "customer_name", label: "Customer" },
      { key: "txn_date", label: "Date", format: "date" },
      { key: "document_type", label: "Type" },
      { key: "document_number", label: "Number" },
      { key: "details", label: "Details" },
      { key: "debit", label: "Debit", align: "right", format: "currency" },
      { key: "credit", label: "Credit", align: "right", format: "currency" },
      { key: "running_balance", label: "Balance", align: "right", format: "currency" },
    ],
  },
  {
    slug: "customer-aging-summary",
    title: "Aging Summary",
    description: "Every customer; open invoice counts per aging bucket. Click a customer for invoice details.",
    category: "Receivables",
    filters: { asOfDate: true, store: true, customerSearch: true, ageRange: true, salesman: true },
    rpc: "get_erp_customer_aging_summary_counts",
    columns: [
      { key: "customer_name", label: "Customer" },
      { key: "bucket_current", label: "Current", align: "right", format: "number" },
      { key: "bucket_1_15", label: "1–15 days", align: "right", format: "number" },
      { key: "bucket_16_30", label: "16–30 days", align: "right", format: "number" },
      { key: "bucket_31_45", label: "31–45 days", align: "right", format: "number" },
      { key: "bucket_over_45", label: ">45 days", align: "right", format: "number" },
      { key: "total_invoices", label: "Total invoices", align: "right", format: "number" },
    ],
  },
  {
    slug: "customer-aging-details",
    title: "Aging Details",
    description: "Open invoices only (balance due greater than zero).",
    category: "Receivables",
    filters: { asOfDate: true, store: true, customerSearch: true, ageRange: true, salesman: true },
    rpc: "get_erp_customer_aging_details",
    columns: [
      { key: "invoice_date", label: "Date", format: "date" },
      { key: "invoice_number", label: "Invoice #" },
      { key: "store_name", label: "Store" },
      { key: "document_type", label: "Type" },
      { key: "status", label: "Status" },
      { key: "customer_name", label: "Customer" },
      { key: "salesman_name", label: "Salesman" },
      { key: "age_days", label: "Age (days)", align: "right", format: "number" },
      { key: "amount", label: "Amount", align: "right", format: "currency" },
      { key: "applied_credit", label: "Applied credit", align: "right", format: "currency" },
      { key: "balance_due", label: "Balance due", align: "right", format: "currency" },
    ],
  },
  {
    slug: "customer-aging",
    title: "Aging Summary Values",
    description: "Every customer; amounts by aging bucket (zeros when none due).",
    category: "Receivables",
    filters: { asOfDate: true, store: true, customerSearch: true, ageRange: true, salesman: true },
    rpc: "get_erp_customer_aging",
    columns: [
      { key: "customer_name", label: "Customer" },
      { key: "bucket_current", label: "Current", align: "right", format: "currency" },
      { key: "bucket_1_15", label: "1–15 days", align: "right", format: "currency" },
      { key: "bucket_16_30", label: "16–30 days", align: "right", format: "currency" },
      { key: "bucket_31_45", label: "31–45 days", align: "right", format: "currency" },
      { key: "bucket_over_45", label: ">45 days", align: "right", format: "currency" },
      { key: "opening_balance_due", label: "Opening balance", align: "right", format: "currency" },
      { key: "available_credit", label: "Unallocated payments", align: "right", format: "currency" },
      { key: "invoice_over_paid", label: "Over-paid", align: "right", format: "currency" },
      { key: "total_due", label: "Total", align: "right", format: "currency" },
    ],
  },
  {
    slug: "payments-received",
    title: "Payments Received",
    description: "Customer payments in the period with mode totals.",
    category: "Payments Received",
    filters: { dateRange: true, store: true, salesman: true },
    rpc: "get_erp_payments_received_report",
    rowsKey: "rows",
    columns: [
      { key: "payment_date", label: "Payment date", format: "date" },
      { key: "invoice_numbers", label: "Invoice #" },
      { key: "store_name", label: "Store" },
      { key: "customer_name", label: "Customer" },
      { key: "payment_mode", label: "Payment type" },
      { key: "total_amount", label: "Paid amount", align: "right", format: "currency" },
      { key: "settlement_discount", label: "Settlement", align: "right", format: "currency" },
      { key: "ar_cleared", label: "AR Cleared", align: "right", format: "currency" },
      { key: "bank_charges", label: "Bank charges", align: "right", format: "currency" },
    ],
  },
  {
    slug: "vendor-balance",
    title: "Vendor Balance",
    description: "Every vendor with payables balance (zeros shown).",
    category: "Payables",
    filters: { store: true, vendorSearch: true },
    rpc: "get_erp_vendor_balance_report",
    columns: [
      { key: "vendor_name", label: "Vendor" },
      { key: "phone", label: "Phone" },
      { key: "opening_balance", label: "Opening", align: "right", format: "currency" },
      { key: "unallocated_amount", label: "Unallocated", align: "right", format: "currency" },
      { key: "balance_due", label: "Balance", align: "right", format: "currency" },
    ],
  },
  {
    slug: "vendor-statement",
    title: "Vendor Statement",
    description: "Chronological bills, payments, and vendor credits with running balance for this store.",
    category: "Payables",
    filters: { dateRange: true, store: true, vendorSearch: true },
    rpc: "get_erp_vendor_statement_report",
    columns: [
      { key: "vendor_name", label: "Vendor" },
      { key: "txn_date", label: "Date", format: "date" },
      { key: "document_type", label: "Type" },
      { key: "document_number", label: "Number" },
      { key: "details", label: "Details" },
      { key: "debit", label: "Debit", align: "right", format: "currency" },
      { key: "credit", label: "Credit", align: "right", format: "currency" },
      { key: "running_balance", label: "Balance", align: "right", format: "currency" },
    ],
  },
  {
    slug: "vendor-aging-summary",
    title: "PB Aging Summary",
    description: "Every vendor; open bill counts per aging bucket. Click a vendor for bill details.",
    category: "Payables",
    filters: { asOfDate: true, store: true, vendorSearch: true, ageRange: true },
    rpc: "get_erp_vendor_aging_summary_counts",
    columns: [
      { key: "vendor_name", label: "Vendor" },
      { key: "bucket_current", label: "Current", align: "right", format: "number" },
      { key: "bucket_1_15", label: "1–15 days", align: "right", format: "number" },
      { key: "bucket_16_30", label: "16–30 days", align: "right", format: "number" },
      { key: "bucket_31_45", label: "31–45 days", align: "right", format: "number" },
      { key: "bucket_over_45", label: ">45 days", align: "right", format: "number" },
      { key: "total_bills", label: "Total bills", align: "right", format: "number" },
    ],
  },
  {
    slug: "vendor-aging-details",
    title: "PB Aging Details",
    description: "Open purchase bills only (balance due greater than zero).",
    category: "Payables",
    filters: { asOfDate: true, store: true, vendorSearch: true, ageRange: true },
    rpc: "get_erp_vendor_aging_details",
    columns: [
      { key: "bill_date", label: "Date", format: "date" },
      { key: "purchase_bill_number", label: "Bill #" },
      { key: "store_name", label: "Store" },
      { key: "status", label: "Status" },
      { key: "vendor_name", label: "Vendor" },
      { key: "age_days", label: "Age (days)", align: "right", format: "number" },
      { key: "amount", label: "Amount", align: "right", format: "currency" },
      { key: "applied_credit", label: "Applied credit", align: "right", format: "currency" },
      { key: "balance_due", label: "Balance due", align: "right", format: "currency" },
    ],
  },
  {
    slug: "vendor-aging",
    title: "PB Aging Summary Values",
    description: "Every vendor; amounts by aging bucket (zeros when none due).",
    category: "Payables",
    filters: { asOfDate: true, store: true, vendorSearch: true, ageRange: true },
    rpc: "get_erp_vendor_aging",
    columns: [
      { key: "vendor_name", label: "Vendor" },
      { key: "bucket_current", label: "Current", align: "right", format: "currency" },
      { key: "bucket_1_15", label: "1–15 days", align: "right", format: "currency" },
      { key: "bucket_16_30", label: "16–30 days", align: "right", format: "currency" },
      { key: "bucket_31_45", label: "31–45 days", align: "right", format: "currency" },
      { key: "bucket_over_45", label: ">45 days", align: "right", format: "currency" },
      { key: "opening_balance_due", label: "Opening balance", align: "right", format: "currency" },
      { key: "available_credit", label: "Unallocated payments", align: "right", format: "currency" },
      { key: "bill_over_paid", label: "Over-paid", align: "right", format: "currency" },
      { key: "total_due", label: "Total", align: "right", format: "currency" },
    ],
  },
  {
    slug: "vat-return-summary",
    title: "VAT Return Summary",
    description: "Output and input VAT by store for the period, with net VAT due.",
    category: "Taxes",
    filters: { dateRange: true, store: true, storeSearch: true },
    rpc: "get_erp_vat_return_summary_report",
    columns: [],
  },
  {
    slug: "vat-return-details",
    title: "VAT Return Details",
    description: "Invoice, credit note, bill, and vendor credit lines with taxable and VAT amounts.",
    category: "Taxes",
    filters: { dateRange: true, store: true, customerSearch: true },
    rpc: "get_erp_vat_return_details_report",
    columns: [],
  },
  {
    slug: "activity-logs",
    title: "Activity Log",
    description: "Who did what across invoices, purchases, payments, and inventory.",
    category: "Activity",
    filters: {
      dateRange: true,
      store: true,
      entityType: true,
      activityAction: true,
      activityUser: true,
      customerSearch: true,
      salesman: true,
    },
    rpc: "get_erp_activity_log_report",
    columns: [
      { key: "created_at", label: "Date", format: "date" },
      { key: "entity_label", label: "Entity" },
      { key: "activity_label", label: "Activity" },
      { key: "entity_reference", label: "Reference" },
      { key: "description", label: "Description" },
      { key: "user_name", label: "User" },
      { key: "store_name", label: "Store" },
    ],
  },
  {
    slug: "deleted-invoices",
    title: "Deleted Invoices",
    description: "Cancelled invoices with line items, who deleted them, and why.",
    category: "Activity",
    filters: { dateRange: true, store: true, customerSearch: true, salesman: true },
    rpc: "get_erp_deleted_invoices_report",
    columns: [
      { key: "invoice_created_at", label: "Invoice created", format: "date" },
      { key: "invoice_number", label: "Invoice #" },
      { key: "customer_name", label: "Customer" },
      { key: "total_amount", label: "Total", align: "right", format: "currency" },
      { key: "discount", label: "Discount", align: "right", format: "currency" },
      { key: "net_amount", label: "Net", align: "right", format: "currency" },
      { key: "deleted_by_name", label: "Deleted by" },
      { key: "deleted_at", label: "Deleted", format: "date" },
      { key: "delete_reason", label: "Reason" },
      { key: "created_by_name", label: "Created by" },
    ],
  },
];

/** Drill-down from Aging Summary (not listed on reports hub). */
export const VENDOR_AGING_SUMMARY_DETAILS_REPORT: ReportDefinition = {
  slug: "vendor-aging-summary-details",
  title: "PB Aging Summary Details",
  description: "Open purchase bills for the selected vendor.",
  category: "Payables",
  filters: { asOfDate: true, store: true },
  rpc: "get_erp_vendor_aging_summary_vendor_details",
  rowsKey: "rows",
  columns: [
    { key: "purchase_bill_number", label: "Bill number" },
    { key: "bill_date", label: "Bill date", format: "date" },
    { key: "due_date", label: "Due date", format: "date" },
    { key: "age_days", label: "Aging days", align: "right", format: "number" },
    { key: "bill_amount", label: "Bill amount", align: "right", format: "currency" },
    { key: "credit", label: "Credit", align: "right", format: "currency" },
    { key: "payment_balance", label: "Payment balance", align: "right", format: "currency" },
  ],
};

export const CUSTOMER_AGING_SUMMARY_DETAILS_REPORT: ReportDefinition = {
  slug: "customer-aging-summary-details",
  title: "Aging Summary Details",
  description: "Open invoices for the selected customer.",
  category: "Receivables",
  filters: { asOfDate: true, store: true, salesman: true },
  rpc: "get_erp_customer_aging_summary_customer_details",
  rowsKey: "rows",
  columns: [
    { key: "invoice_number", label: "Invoice number" },
    { key: "invoice_date", label: "Invoice date", format: "date" },
    { key: "due_date", label: "Invoice due date", format: "date" },
    { key: "age_days", label: "Aging days", align: "right", format: "number" },
    { key: "invoice_amount", label: "Invoice amount", align: "right", format: "currency" },
    { key: "credit", label: "Credit", align: "right", format: "currency" },
    { key: "payment_balance", label: "Payment balance", align: "right", format: "currency" },
  ],
};

export function getReportBySlug(slug: string): ReportDefinition | undefined {
  if (slug === CUSTOMER_AGING_SUMMARY_DETAILS_REPORT.slug) {
    return CUSTOMER_AGING_SUMMARY_DETAILS_REPORT;
  }
  if (slug === VENDOR_AGING_SUMMARY_DETAILS_REPORT.slug) {
    return VENDOR_AGING_SUMMARY_DETAILS_REPORT;
  }
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
  if (typeof data === "string") {
    try {
      return extractReportRows(JSON.parse(data) as unknown, rowsKey);
    } catch {
      return [];
    }
  }
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (typeof data !== "object") return [];

  const obj = data as Record<string, unknown>;

  if (rowsKey && Array.isArray(obj[rowsKey])) {
    return obj[rowsKey] as Record<string, unknown>[];
  }
  if (rowsKey && typeof obj[rowsKey] === "string") {
    return extractReportRows(obj[rowsKey], rowsKey);
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
