/** Phase 3 purchasing document types (ERP extension). */

export interface ErpPurchaseLineInput {
  productId?: string | null;
  variantId?: string | null;
  productName: string;
  barcode?: string | null;
  expiryDate?: string | null;
  quantity: number;
  purchasePrice: number;
  taxRatePercent: number;
  unitId?: string | null;
}

export interface ErpLandedCostLineInput {
  landedCostItemId?: string | null;
  name: string;
  quantity: number;
  rate: number;
  taxRatePercent: number;
}

export interface ErpVendorCreditLineInput {
  productId?: string | null;
  variantId?: string | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  taxRatePercent: number;
}

export interface SupplierPaymentAllocationInput {
  purchaseBillId: string;
  amount: number;
}

export interface ErpPurchaseBillListRow {
  id: string;
  purchase_bill_number: string;
  vendor_bill_number: string | null;
  vendor_id: string;
  store_id: string;
  po_id: string | null;
  status: string;
  total_amount: number;
  amount_paid: number;
  credits_applied: number;
  balance_due: number;
  purchase_date: string;
  due_date: string | null;
  vendor_name: string | null;
  store_name: string | null;
  po_number: string | null;
  display_status: string;
}

export interface ErpPurchaseOrderListRow {
  id: string;
  po_number: string | null;
  vendor_id: string | null;
  store_id: string | null;
  status: string | null;
  reference: string | null;
  po_date: string | null;
  expected_delivery_date: string | null;
  subtotal: number;
  tax_total: number;
  discount: number;
  total_amount: number | null;
  created_at: string | null;
  vendor_name: string | null;
  store_name: string | null;
}

export interface ErpPurchaseOrderLineRow {
  id: string;
  product_id?: string | null;
  variant_id: string | null;
  quantity: number;
  price: number;
  tax_rate_percent: number;
  tax_amount: number;
  line_total: number;
  received_qty?: number;
  accepted_qty?: number;
  rejected_qty?: number;
  product_variants: {
    id: string;
    name: string | null;
    barcode: string | null;
    product_id?: string | null;
    products: { id: string; name: string | null } | null;
  } | null;
}

export interface ErpPurchaseOrderBillLineSummary {
  id: string;
  variant_id: string | null;
  product_id?: string | null;
  product_name: string;
  original_quantity: number | null;
  quantity: number;
  accepted_qty: number;
}

export interface ErpPurchaseOrderLinkedBillDetail {
  id: string;
  purchase_bill_number: string;
  status: string;
  accounting_posted: boolean;
  total_amount: number;
  lines: ErpPurchaseOrderBillLineSummary[];
}

export interface ErpPurchaseOrderDeliverySummary {
  hasDraftBill: boolean;
  deliverySubmitted: boolean;
  receiveId: string | null;
  receiveNumber: string | null;
  canSubmitDelivery: boolean;
}

export interface ErpPurchaseOrderLineDiscrepancy {
  poLineId: string;
  productName: string;
  orderedQty: number;
  originalBillQty: number;
  deliveredQty: number;
  finalBillQty: number;
  varianceVsOrder: number;
  varianceVsOriginalBill: number;
}

export interface ErpPurchaseOrderDetail {
  id: string;
  po_number: string | null;
  vendor_id: string;
  store_id: string | null;
  status: string | null;
  reference: string | null;
  po_date: string | null;
  expected_delivery_date: string | null;
  subtotal: number;
  tax_total: number;
  discount: number;
  total_amount: number | null;
  notes: string | null;
  created_at: string | null;
  vendors: {
    id: string;
    name: string | null;
    contact: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    trn: string | null;
  } | null;
  stores: { id: string; name: string | null } | null;
  purchase_order_items: ErpPurchaseOrderLineRow[];
  purchase_order_landed_costs?: Array<{
    id: string;
    landed_cost_item_id: string | null;
    name: string;
    quantity: number;
    rate: number;
    tax_rate_percent: number;
  }>;
  linked_bill: ErpPurchaseOrderLinkedBillDetail | null;
  delivery: ErpPurchaseOrderDeliverySummary;
  discrepancies: ErpPurchaseOrderLineDiscrepancy[];
}

export interface ErpProductSearchRow {
  id: string;
  product_name: string;
  barcode: string | null;
  purchase_price: number | null;
  tax_rate_percent: number | null;
}

/** @deprecated Use ErpProductSearchRow — ERP purchasing is product-level */
export type ErpVariantSearchRow = ErpProductSearchRow & { name?: string | null };

export interface PurchaseLineFormRow {
  key: string;
  productId: string | null;
  variantId: string | null;
  productName: string;
  barcode: string;
  expiryDate: string;
  quantity: number;
  purchasePrice: number;
  taxRatePercent: number;
}

export interface LandedCostFormRow {
  key: string;
  landedCostItemId: string | null;
  name: string;
  quantity: number;
  rate: number;
  taxRatePercent: number;
}

/** Derived bill status for list UI (not stored). */
export function derivePurchaseBillDisplayStatus(
  status: string,
  balanceDue: number,
  dueDate: string | null,
): string {
  if (status === "draft") return "Draft";
  if (status === "cancelled") return "Cancelled";
  if (status === "paid" || balanceDue <= 0) return "Paid";
  if (dueDate && balanceDue > 0) {
    const due = new Date(dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (due < today) return "Overdue";
  }
  if (status === "partial") return "Partial";
  return "Unpaid";
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calcPurchaseLine(
  quantity: number,
  purchasePrice: number,
  taxRatePercent: number,
) {
  const taxable = roundMoney(quantity * purchasePrice);
  const taxAmount = roundMoney(taxable * (taxRatePercent / 100));
  const lineTotal = roundMoney(taxable + taxAmount);
  return { taxable, taxAmount, lineTotal };
}

/** Supplier payment modes used across Payment Made workflows. */
export const ERP_SUPPLIER_PAYMENT_MODES = [
  "Cash",
  "Card",
  "Cheque",
  "Bank Remittance",
  "Bank Transfer",
] as const;

export type ErpSupplierPaymentMode = (typeof ERP_SUPPLIER_PAYMENT_MODES)[number];

export const VENDOR_TYPE_OPTIONS = [
  "Select",
  "ServiceProvider",
  "Supplier",
  "Manufacturer",
  "Shipper",
] as const;

export type VendorTypeOption = (typeof VENDOR_TYPE_OPTIONS)[number];

export interface ErpSupplierPaymentListRow {
  id: string;
  payment_number: string;
  vendor_id: string;
  store_id: string;
  payment_date: string;
  payment_mode: string;
  total_amount: number;
  is_bulk: boolean;
  unallocated_amount: number;
  vendor_name: string | null;
  store_name: string | null;
  reference: string | null;
  account_name: string | null;
  bill_numbers: string | null;
  payment_made_for: string | null;
}

export interface SupplierPaymentModeTotals {
  Cash: number;
  Card: number;
  Cheque: number;
  "Bank Remittance": number;
  "Bank Transfer": number;
  total: number;
}

export interface PayablePurchaseBillRow {
  id: string;
  purchase_bill_number: string;
  purchase_date: string;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
}

export interface PaidThroughAccountOption {
  id: string;
  name: string;
  code: string;
  account_type_name: string;
  store_name: string | null;
}

export interface BulkSupplierPaymentBatchRow {
  batch_id: string;
  payment_date: string;
  store_id: string;
  store_name: string | null;
  total_amount: number;
  payment_mode: string;
  account_name: string | null;
  notes: string | null;
  created_by_name: string | null;
  supplier_count: number;
}

export interface BulkSupplierPaymentLine {
  payment_id: string;
  payment_number: string;
  vendor_id: string;
  vendor_name: string | null;
  amount: number;
  current_balance: number;
}

export interface VendorErpProfile {
  id: string;
  name: string | null;
  contact: string | null;
  vendor_type: string | null;
  trn: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
  address: string | null;
  po_box: string | null;
  notes: string | null;
  opening_balance: number;
  opening_balance_date: string | null;
  is_active: boolean | null;
  created_at: string | null;
}

export interface VendorErpListRow {
  id: string;
  name: string | null;
  address: string | null;
  trn: string | null;
  phone: string | null;
  fax: string | null;
  po_box: string | null;
  email: string | null;
  vendor_type: string | null;
  is_active: boolean | null;
}

export interface ErpVendorCreditListRow {
  id: string;
  credit_number: string;
  vendor_id: string;
  store_id: string;
  status: string;
  total_amount: number;
  balance_remaining: number;
  credit_date: string;
  vendor_name: string | null;
  store_name: string | null;
}

export interface ErpExpenseListRow {
  id: string;
  expense_number: string;
  store_id: string;
  expense_date: string;
  amount: number;
  total_amount: number;
  reference: string | null;
  account_id: string;
  account_name: string | null;
  paid_through_name: string | null;
  vendor_name: string | null;
  customer_name: string | null;
  store_name: string | null;
}

export interface ErpExpenseDetail {
  id: string;
  expense_number: string;
  store_id: string;
  store_name: string | null;
  expense_date: string;
  account_id: string;
  account_name: string | null;
  amount: number;
  tax_mode: string;
  tax_percent: number;
  tax_amount: number;
  total_amount: number;
  paid_through_account_id: string | null;
  paid_through_name: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  user_id: string | null;
  customer_name: string | null;
  reference: string | null;
  notes: string | null;
  is_billable?: boolean;
  billable_customer_id?: string | null;
  billed_invoice_id?: string | null;
  attachment_url?: string | null;
  created_at: string;
}

export interface ErpLandedCostItem {
  id: string;
  name: string;
  description: string | null;
  rate: number;
  tax_rate_percent: number;
  is_active: boolean;
}

export interface VendorErpSummary {
  openingBalance: number;
  openingBalanceDate: string | null;
  billTotal: number;
  paymentMade: number;
  creditTotal: number;
  creditBalance: number;
  refundTotal: number;
  balanceDue: number;
  payables: number;
}

export interface VendorStatementLine {
  date: string;
  storeName: string | null;
  transactionType: string;
  details: string;
  amount: number;
  payments: number;
  balance: number;
}

export interface PurchaseReceiveAdjustments {
  shortfall_policy: "vendor_credit" | "ignore";
  bill_posted: boolean;
  requires_vendor_credit: boolean;
  shortfall_lines: Array<{
    bill_line_id: string;
    product_id?: string | null;
    variant_id: string | null;
    product_name: string;
    billed_qty: number;
    accepted_qty: number;
    shortfall_qty: number;
    purchase_price: number;
    tax_rate_percent: number;
    credit_amount: number;
  }>;
  rejected_lines: Array<{
    bill_line_id: string | null;
    product_id?: string | null;
    variant_id: string | null;
    product_name: string;
    rejected_qty: number;
    purchase_price: number;
    tax_rate_percent: number;
    credit_amount: number;
  }>;
}
