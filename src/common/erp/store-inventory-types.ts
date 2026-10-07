export type PurchaseHistoryRow = {
  billId: string;
  billNumber: string;
  billDate: string;
  vendorName: string | null;
  quantity: number;
  unitPrice: number;
  loadedUnitCost: number | null;
  lineTotal: number;
};

export type SalesHistoryRow = {
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
  movements: StoreInventoryMovementRow[];
};
