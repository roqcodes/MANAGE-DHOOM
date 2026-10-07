/** Phase 2 sales document types (ERP extension). */

export interface ErpLineInput {
  variantId?: string | null;
  productId?: string | null;
  productName: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
  taxRatePercent: number;
  purchasePrice?: number | null;
  unitId?: string | null;
  vendorId?: string | null;
}

export interface ErpInvoiceListRow {
  id: string;
  invoice_number: string;
  user_id: string;
  store_id: string | null;
  status: string;
  total_amount: number;
  amount_paid: number;
  credits_applied: number;
  balance_due: number;
  created_at: string;
  due_date: string | null;
  source: string;
  customer_name: string | null;
  store_name: string | null;
}

export interface ErpEstimateListRow {
  id: string;
  estimate_number: string;
  user_id: string;
  store_id: string;
  status: string;
  total_amount: number;
  estimate_date: string;
  valid_until: string | null;
  customer_name: string | null;
  store_name: string | null;
}

export interface ErpPaymentListRow {
  id: string;
  payment_number: string;
  store_id: string;
  user_id: string;
  payment_date: string;
  payment_mode: string;
  total_amount: number;
  is_bulk: boolean;
  unallocated_amount: number;
  customer_name: string | null;
  store_name: string | null;
  invoice_number: string | null;
  bank_charges: number;
}

export interface ErpPaymentSummary {
  cash: number;
  card: number;
  cheque: number;
  bankRemittance: number;
  bankTransfer: number;
  total: number;
}

export function paymentModeLabel(mode: string): string {
  const labels: Record<string, string> = {
    Cash: "Cash",
    CreditCard: "Card",
    Cheque: "Cheque",
    BankRemittance: "Bank Remittance",
    BankTransfer: "Bank Transfer",
    UPI: "UPI",
  };
  return labels[mode] ?? mode;
}

export interface ErpCreditNoteListRow {
  id: string;
  credit_note_number: string;
  user_id: string;
  store_id: string;
  status: string;
  total_amount: number;
  balance_remaining: number;
  credit_note_date: string;
  customer_name: string | null;
  store_name: string | null;
}

export interface CustomerErpSummary {
  openingBalance: number;
  invoiceTotal: number;
  invoiceCount: number;
  creditNoteTotal: number;
  creditNoteCount: number;
  paymentReceived: number;
  balanceDue: number;
  receivables: number;
  creditLimit: number | null;
  unallocatedPayments: number;
}

export interface CustomerErpProfile {
  id: string;
  customerNumber: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  trn: string | null;
  contactDisplayName: string | null;
  location: string | null;
  poBox: string | null;
  customerNotes: string | null;
  openingBalance: number;
  openingBalanceDate: string | null;
  creditLimit: number | null;
  address: string | null;
  isVerified: boolean;
  createdAt: string | null;
}

export interface CustomerInvoiceRow {
  id: string;
  invoiceNumber: string;
  createdAt: string;
  dueDate: string | null;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  status: string;
  storeName: string | null;
}

export interface CustomerStatementLine {
  date: string;
  storeName: string | null;
  transactionType: string;
  details: string;
  amount: number;
  payments: number;
  balance: number;
}

export interface PaymentAllocationInput {
  invoiceId: string;
  amount: number;
}

export const ERP_CUSTOMER_PAYMENT_MODES = [
  "Cash",
  "CreditCard",
  "Cheque",
  "BankRemittance",
  "BankTransfer",
  "UPI",
] as const;

export type ErpCustomerPaymentMode = (typeof ERP_CUSTOMER_PAYMENT_MODES)[number];

export interface PaidThroughAccountOption {
  id: string;
  code: string;
  name: string;
  account_type_name: string;
  store_name: string | null;
}

export interface BulkCustomerPaymentBatchRow {
  batch_id: string;
  payment_date: string;
  store_id: string;
  store_name: string | null;
  total_amount: number;
  payment_mode: string;
  account_name: string | null;
  receipts: string | null;
  customer_count: number;
  invoices_count: number;
  created_by_name: string | null;
  notes: string | null;
}

export interface BulkCustomerPaymentLine {
  payment_id: string;
  payment_number: string;
  user_id: string;
  customer_name: string | null;
  amount: number;
  receipt_ref: string | null;
  store_name: string | null;
  allocations: BulkCustomerPaymentAllocationRow[];
}

export interface BulkCustomerPaymentAllocationRow {
  invoice_id: string;
  invoice_number: string;
  due_date: string | null;
  invoice_amount: number;
  paid_amount: number;
  total_paid_to_invoice: number;
  current_balance: number;
  status: string;
}

export interface SalesLineFormRow {
  key: string;
  productId: string | null;
  variantId: string | null;
  productName: string;
  description: string;
  barcode: string;
  quantity: number;
  unitPrice: number;
  taxRatePercent: number;
  unitId: string | null;
}

export interface ErpSalesProductSearchRow {
  id: string;
  product_name: string;
  barcode: string | null;
  sales_price: number | null;
  purchase_price: number | null;
  tax_rate_percent: number | null;
  available_stock: number;
}

/** Variant-level row for online → store transfer catalog. */
export interface OnlineVariantTransferRow {
  id: string;
  variant_name: string;
  product_id: string;
  product_name: string;
  barcode: string | null;
  available_stock: number;
}

/** @deprecated Use ErpSalesProductSearchRow */
export type ErpSalesVariantSearchRow = ErpSalesProductSearchRow;

export function calcSalesLine(
  quantity: number,
  unitPrice: number,
  taxRatePercent: number,
  taxInclusive = false,
) {
  const lineTotal = quantity * unitPrice;
  if (taxInclusive && taxRatePercent > 0) {
    const taxable = lineTotal / (1 + taxRatePercent / 100);
    const taxAmount = lineTotal - taxable;
    return { taxable: roundSalesMoney(taxable), taxAmount: roundSalesMoney(taxAmount), total: roundSalesMoney(lineTotal) };
  }
  const taxAmount = lineTotal * (taxRatePercent / 100);
  return { taxable: roundSalesMoney(lineTotal), taxAmount: roundSalesMoney(taxAmount), total: roundSalesMoney(lineTotal + taxAmount) };
}

export function roundSalesMoney(n: number) {
  return Math.round(n * 100) / 100;
}
