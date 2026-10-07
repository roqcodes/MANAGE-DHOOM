export type PurchaseLinePayload = {
  productId?: string | null;
  productName?: string;
  barcode?: string | null;
  expiryDate?: string | null;
  quantity: number;
  purchasePrice: number;
  taxRatePercent: number;
  unitId?: string | null;
};

export type LandedCostPayload = {
  landedCostItemId?: string | null;
  name: string;
  quantity: number;
  rate: number;
  taxRatePercent: number;
};

export type PurchaseOrderCreatePayload = {
  vendorId: string;
  poDate: string;
  expectedDeliveryDate?: string | null;
  reference?: string | null;
  notes?: string | null;
  lines: PurchaseLinePayload[];
  discount?: number;
  landedCosts?: LandedCostPayload[];
};

export type PurchaseOrderUpdatePayload = PurchaseOrderCreatePayload & {
  poId: string;
};

export type PurchaseOrderDeliverLinePayload = {
  poLineId: string;
  deliveredQty: number;
};

export type PurchaseOrderDeliverFinalizePayload = {
  poId: string;
  receiveDate?: string;
  notes?: string | null;
  lines: PurchaseOrderDeliverLinePayload[];
};

export type PurchaseBillCreatePayload = {
  vendorId: string;
  purchaseDate: string;
  dueDate?: string | null;
  expectedDeliveryDate?: string | null;
  poId?: string | null;
  vendorBillNumber?: string | null;
  grnReference?: string | null;
  batchReference?: string | null;
  reference?: string | null;
  notes?: string | null;
  lines: PurchaseLinePayload[];
  landedCosts?: LandedCostPayload[];
  discount?: number;
  finalize?: boolean;
  physicalReceiptOnBill?: boolean;
};

export type PurchaseBillUpdatePayload = Omit<PurchaseBillCreatePayload, "finalize"> & {
  billId: string;
};

export type PurchaseBillFinalizePayload = {
  billId: string;
};

export type PurchaseBillCancelPayload = {
  billId: string;
};

export function purchaseOrderResourceScope(poId: string): string {
  return `purchase_order:${poId}`;
}

export function purchaseBillResourceScope(billId: string): string {
  return `purchase_bill:${billId}`;
}
