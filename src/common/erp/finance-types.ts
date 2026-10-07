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

export type AccountTypeRow = {
  id: string;
  account_category: string;
  name: string;
  description: string;
  is_system: boolean;
};

export type AccountListRow = {
  id: string;
  code: string;
  name: string;
  description: string;
  account_type_id: string;
  account_type_name: string;
  account_category: string;
  store_id: string | null;
  store_name: string | null;
  is_system: boolean;
  is_locked: boolean;
  is_active: boolean;
  opening_balance: number;
  current_balance: number;
};

export type JournalEntryListRow = {
  id: string;
  journal_number: string;
  transaction_date: string;
  description: string;
  store_name: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  total_debit: number;
  total_credit: number;
  status: string;
  created_at: string;
};

export type JournalEntryLineRow = {
  id: string;
  account_code: string;
  account_name: string;
  debit_amount: number;
  credit_amount: number;
  description: string;
};

export type SourceJournalGroup = {
  journal_id: string;
  journal_number: string;
  transaction_date: string;
  description: string | null;
  lines: JournalEntryLineRow[];
};

export type BankingAccountRow = AccountListRow;

export type AccountTransactionRow = {
  id: string;
  transaction_number: string;
  transaction_date: string;
  transaction_type: string;
  details: string;
  debit_amount: number;
  credit_amount: number;
  running_balance: number | null;
  reference: string | null;
  payment_type: string | null;
  store_id: string | null;
  store_name: string | null;
  account_id: string;
  account_name: string | null;
};

export type PaymentStatementRow = {
  id: string;
  transaction_date: string;
  store_name: string | null;
  account_name: string;
  transaction_type: string;
  details: string;
  payment_type: string | null;
  debit_amount: number;
  credit_amount: number;
  running_balance: number | null;
};

export type ProfitWithdrawalRow = {
  id: string;
  transaction_number: string;
  transaction_date: string;
  store_name: string | null;
  from_account_name: string;
  to_account_name: string | null;
  reference: string | null;
  details: string;
  amount: number;
  payment_type: string | null;
};

export type AccountStoreBalanceRow = {
  store_id: string | null;
  store_name: string;
  balance: number;
};

export const PAYMENT_MODE_OPTIONS = [
  "Cash",
  "CreditCard",
  "Cheque",
  "BankRemittance",
  "BankTransfer",
  "UPI",
] as const;

export type PaymentMode = (typeof PAYMENT_MODE_OPTIONS)[number];

export const BANKING_TRANSACTION_TYPES = {
  owner_contribution: "Owner's contribution",
  owner_drawing: "Owner's drawings",
  profit_withdrawal: "Profit withdrawal",
  loan_taking: "Loan taking",
  loan_repayment: "Loan repayment",
  generic: "Other income",
  payment_statement: "Payment statement",
  expense: "Expense",
  fixed_asset: "Fixed asset purchase",
  customer_payment: "Customer payment",
  supplier_payment: "Supplier payment",
  invoice: "Invoice",
  credit_note: "Credit note",
  vat_payment: "VAT payment",
  vat_return: "VAT return",
  purchase_bill: "Purchase bill",
  journal: "Journal",
  account_transfer: "Account transfer",
} as const;

export type VatReturnPreview = {
  output_tax: number;
  input_tax: number;
  total_tax_payable: number;
  recoverable_tax: number;
};

export type LastFiledVatReturnSummary = {
  id: string;
  return_number: string;
  period_start: string;
  period_end: string;
  filed_date: string | null;
} | null;

export type VatReturnListRow = {
  id: string;
  return_number: string;
  period_label: string;
  period_start: string;
  period_end: string;
  store_id: string | null;
  store_name: string | null;
  filed_date: string | null;
  status: string;
  output_tax: number;
  input_tax: number;
  total_tax_payable: number;
  balance_due: number;
  notes: string | null;
};

export type VatReturnDetail = VatReturnListRow;

export type VatReturnSourceLine = {
  id: string;
  document_number: string;
  document_date: string;
  party_name: string | null;
  tax_amount: number;
  total_amount: number;
  href: string;
};

export type VatReturnPaymentLine = {
  id: string;
  payment_number: string;
  payment_date: string;
  amount: number;
  payment_type: string;
  reference: string | null;
  href: string;
};

export type VatReturnDetailWithSources = VatReturnDetail & {
  recoverable_tax: number;
  sources: {
    sales_invoices: VatReturnSourceLine[];
    credit_notes: VatReturnSourceLine[];
    purchase_bills: VatReturnSourceLine[];
    vendor_credits: VatReturnSourceLine[];
    payments: VatReturnPaymentLine[];
  };
};

export const ERP_VAT_PAYMENT_TYPES = ["Cash", "Bank", "Cheque"] as const;

export type VatPaymentListRow = {
  id: string;
  payment_number: string;
  vat_return_id: string;
  payment_date: string;
  reference: string | null;
  store_id: string | null;
  store_name: string | null;
  paid_from_account_id: string;
  paid_from_account_name: string | null;
  payment_type: string;
  notes: string | null;
  amount: number;
  return_number: string | null;
  period_label: string | null;
};

export type FixedAssetListRow = {
  id: string;
  asset_number: string;
  name: string;
  serial_number: string | null;
  brand: string | null;
  purchase_date: string;
  purchase_amount: number;
  warranty_expiry: string | null;
  store_name: string | null;
  vendor_name: string | null;
};

export type FixedAssetMaintenanceInfo = {
  servicePerson?: string;
  serviceContact?: string;
  serviceAddress?: string;
};

export type FixedAssetDetail = {
  id: string;
  asset_number: string;
  name: string;
  serial_number: string | null;
  brand: string | null;
  reference: string | null;
  details: string | null;
  purchase_date: string;
  purchase_amount: number;
  paid_through_account_id: string | null;
  tax_amount: number;
  tax_mode: "none" | "exclusive" | "inclusive";
  vendor_id: string | null;
  warranty_expiry: string | null;
  warranty_details: string | null;
  maintenance_info: string | null;
  store_id: string | null;
  created_at: string;
  stores: { name: string } | null;
  vendors: { name: string } | null;
  accounts: { name: string; code: string } | null;
};

export function parseFixedAssetMaintenance(
  raw: string | null | undefined,
): FixedAssetMaintenanceInfo {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as FixedAssetMaintenanceInfo;
    return {
      servicePerson: parsed.servicePerson ?? "",
      serviceContact: parsed.serviceContact ?? "",
      serviceAddress: parsed.serviceAddress ?? "",
    };
  } catch {
    return { serviceAddress: raw };
  }
}

export function serializeFixedAssetMaintenance(info: FixedAssetMaintenanceInfo): string | null {
  const trimmed = {
    servicePerson: info.servicePerson?.trim() ?? "",
    serviceContact: info.serviceContact?.trim() ?? "",
    serviceAddress: info.serviceAddress?.trim() ?? "",
  };
  if (!trimmed.servicePerson && !trimmed.serviceContact && !trimmed.serviceAddress) {
    return null;
  }
  return JSON.stringify(trimmed);
}

export type ErpFinancialDashboard = {
  accounts_receivable: number;
  accounts_payable: number;
  net_income_ytd: number;
  cogs_ytd: number;
  expenses_ytd: number;
  net_profit_ytd: number;
  low_stock_count: number;
  daily_sales: Array<{ day: string; total: number }>;
  invoice_status_ytd: Array<{ status: string; count: number; total: number }>;
};

export type ErpReconciliationSnapshot = Record<string, unknown>;
