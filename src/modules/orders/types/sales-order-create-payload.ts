/** Frozen outbox payload for sales_order.create (matches create API body minus idempotency envelope). */
export type SalesOrderCreateLinePayload = {
  productId: string;
  quantity: number;
  unitPrice?: number;
  taxRatePercent?: number;
};

export type SalesOrderCreatePayload = {
  userId: string;
  referenceNumber?: string;
  shipmentDate?: string;
  deliveryMethod?: string;
  salesPersonId?: string;
  estimateId?: string;
  subtotal: number;
  tax: number;
  discount: number;
  totalAmount: number;
  taxInclusive?: boolean;
  items: SalesOrderCreateLinePayload[];
};
