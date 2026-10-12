export type PurchaseHistoryRow = {
  lineId: string;
  billId: string;
  billNumber: string;
  billDate: string;
  vendorName: string | null;
  quantity: number;
  unitPrice: number;
  /** Landed cost allocated to this bill line (document share). */
  landedCostAllocated: number | null;
  loadedUnitCost: number | null;
  lineTotal: number;
};

export type SalesHistoryRow = {
  lineId: string;
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type StoreProductPurchaseGlance = {
  minUnitCost: number | null;
  maxUnitCost: number | null;
  avgUnitCost: number | null;
  purchaseCount: number;
  totalQtyPurchased: number;
  wacAtStore: number | null;
  recent: PurchaseHistoryRow[];
};

export type StoreProductSalesGlance = {
  minUnitPrice: number | null;
  maxUnitPrice: number | null;
  avgUnitPrice: number | null;
  saleCount: number;
  totalQtySold: number;
  recent: SalesHistoryRow[];
};

/** Customer sales return (credit note line). */
export type SalesReturnHistoryRow = {
  lineId: string;
  creditNoteId: string;
  creditNoteNumber: string;
  creditNoteDate: string;
  customerName: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type StoreProductSalesReturnGlance = {
  minUnitPrice: number | null;
  maxUnitPrice: number | null;
  avgUnitPrice: number | null;
  returnCount: number;
  totalQtyReturned: number;
  recent: SalesReturnHistoryRow[];
};

/** Vendor return (vendor credit line). */
export type VendorReturnHistoryRow = {
  lineId: string;
  vendorCreditId: string;
  creditNumber: string;
  creditDate: string;
  vendorName: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type StoreProductVendorReturnGlance = {
  minUnitPrice: number | null;
  maxUnitPrice: number | null;
  avgUnitPrice: number | null;
  returnCount: number;
  totalQtyReturned: number;
  recent: VendorReturnHistoryRow[];
};

export type StoreInventoryMovementRow = {
  id: string;
  createdAt: string;
  type: string;
  quantity: number;
  transactionPrice: number | null;
  referenceType: string | null;
  referenceId: string | null;
  reason: string | null;
};

export type StoreInventoryProductDetail = {
  productId: string;
  productName: string;
  barcode: string | null;
  catalogPurchasePrice: number | null;
  catalogSalesPrice: number | null;
  storeId: string;
  storeName: string;
  onHandStock: number;
  centralStock: number;
  storeSalesPrice: number | null;
  storeWac: number | null;
  purchase: StoreProductPurchaseGlance;
  sales: StoreProductSalesGlance;
  salesReturns: StoreProductSalesReturnGlance;
  vendorReturns: StoreProductVendorReturnGlance;
  movements: StoreInventoryMovementRow[];
};
