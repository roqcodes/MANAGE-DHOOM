/** Phase 4 inventory + transfer types. */

export interface ErpStoreListRow {
  id: string;
  company_id: string;
  name: string;
  code: string | null;
  phone: string | null;
  is_active: boolean;
  store_type: string | null;
  country: string | null;
  currency: string | null;
  markup_percent: number;
}

export interface StockAdjustmentLineInput {
  productId: string;
  direction: "add" | "remove";
  quantity: number;
  purchaseCost: number;
}

export interface TransferRequestLineInput {
  productId: string;
  quantity: number;
  sourceAvailable?: number;
  transferPrice?: number;
  salesPrice?: number;
  averagePurchaseCost?: number;
  note?: string | null;
}

export interface StoreTransferLineInput {
  productId: string;
  quantity: number;
  purchasePrice?: number;
  salesPrice?: number;
  markupPercent?: number;
  markupType?: string | null;
  markupAmount?: number;
  transferPrice: number;
}

export interface ErpStockAdjustmentListRow {
  id: string;
  adjustment_number: string;
  store_id: string;
  adjustment_date: string;
  status: string;
  total_add_cost: number;
  total_remove_cost: number;
  store_name: string | null;
}

export interface ErpTransferRequestListRow {
  id: string;
  request_number: string;
  from_store_id: string;
  to_store_id: string;
  request_date: string;
  status: string;
  from_store_name: string | null;
  to_store_name: string | null;
}

export interface ErpStoreTransferListRow {
  id: string;
  transfer_number: string;
  from_store_id: string;
  to_store_id: string;
  transfer_date: string;
  status: string;
  from_store_name: string | null;
  to_store_name: string | null;
}

export interface StockDetailRow {
  product_id: string;
  variant_id: string | null;
  product_name: string;
  variant_name: string | null;
  central_stock: number;
  store_stock: number | null;
  purchase_price: number | null;
  sales_price: number | null;
  barcode: string | null;
}

export interface TransferStatementLine {
  date: string;
  type: string;
  reference: string;
  stock_out: number;
  stock_in: number;
  amount: number;
  payments: number;
}

export interface TransferStatementSummary {
  openingBalance: number;
  totalStockOut: number;
  totalStockIn: number;
  totalAmount: number;
  totalPayments: number;
  paymentBalance: number;
  lines: TransferStatementLine[];
}

export interface ItemTransactionRow {
  id: string;
  created_at: string;
  store_id: string | null;
  store_name: string | null;
  transfer_store_id: string | null;
  transfer_store_name: string | null;
  type: string;
  variant_id: string;
  product_name: string;
  variant_name: string | null;
  barcode: string | null;
  quantity: number;
  transaction_price: number | null;
  balance_after: number | null;
  reference_id: string | null;
  reference_type: string | null;
  reason: string | null;
  invoice_number: string | null;
}

export interface ErpTransferPaymentListRow {
  id: string;
  payment_number: string;
  transfer_id: string;
  transfer_number: string | null;
  from_store_id: string;
  to_store_id: string;
  from_store_name: string | null;
  to_store_name: string | null;
  payment_date: string;
  payment_mode: string;
  amount: number;
  reference: string | null;
  notes: string | null;
}

export interface PendingTransferPaymentRow {
  transfer_id: string;
  transfer_number: string;
  transfer_date: string;
  from_store_id: string;
  to_store_id: string;
  from_store_name: string | null;
  to_store_name: string | null;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  status: string;
}

export interface StoreCreateInput {
  name: string;
  code?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  phone?: string | null;
  description?: string | null;
  storeType?: string | null;
  markupPercent?: number;
  country?: string | null;
  currency?: string | null;
  trn?: string | null;
  taxTemplate?: string | null;
  isActive?: boolean;
  logoUrl?: string | null;
}

export const STORE_TYPES = ["Warehouse", "Retail", "Wholesale", "Van Sale"] as const;
