export type LineProductContext = {
  productId: string;
  /** Signed on-hand at store (may be negative when ERP policy allows). */
  onHandStock: number;
  availableStock: number;
  /** Weighted-average unit cost at store (includes landed cost in receipts). */
  avgPurchasePrice: number | null;
  /** Most recent finalized bill line unit cost (loaded if allocated). */
  lastPurchasePrice: number | null;
  /** Quantity-weighted average unit price on store sales invoices. */
  avgSellingPrice: number | null;
  lastSellingPrice: number | null;
  counterpartyLastPrice: number | null;
  /** Current store list price (store_product_inventory.sales_price or product.price). */
  storeSalesPrice: number | null;
  /** Product master purchase_price. */
  catalogPurchasePrice: number | null;
  taxRatePercent: number | null;
};

export type LineProductContextMap = Record<string, LineProductContext>;
