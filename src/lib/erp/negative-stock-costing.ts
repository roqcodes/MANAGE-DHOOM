/** Mirrors store_product_inventory_apply_receipt_cost WAC (20161020160000). */
export function applyReceiptAvco(
  onHand: number,
  currentWac: number | null,
  receiptQty: number,
  receiptUnitCost: number,
): { stock: number; wac: number | null } {
  if (receiptQty === 0) {
    return { stock: onHand, wac: currentWac };
  }

  const newStock = onHand + receiptQty;
  if (receiptQty < 0) {
    return { stock: newStock, wac: newStock === 0 ? null : currentWac };
  }

  if (onHand <= 0 || currentWac == null) {
    return { stock: newStock, wac: round4(receiptUnitCost) };
  }

  const blended = (onHand * currentWac + receiptQty * receiptUnitCost) / (onHand + receiptQty);
  return { stock: newStock, wac: round4(blended) };
}

/**
 * Historical erp_invoice_item_margin_components unit-cost pick.
 * When stored cost equals selling price it falls through to live SPI WAC.
 */
export function selectMarginUnitCostLegacy(input: {
  quantity: number;
  pendingCostQty: number;
  basePrice: number | null;
  unitPrice: number | null;
  liveResolvedCost: number;
}): number {
  const qty = Math.max(input.quantity, 0);
  const pending = Math.min(Math.max(input.pendingCostQty, 0), qty);
  if (qty <= 0 || pending >= qty) return 0;

  const base = input.basePrice ?? 0;
  if (base > 0 && (input.unitPrice == null || Math.abs(base - input.unitPrice) > 0.0001)) {
    return base;
  }
  return input.liveResolvedCost;
}

/** Sale-time pin: use stored base_price whenever it is a positive cost. */
export function selectMarginUnitCostPinned(input: {
  quantity: number;
  pendingCostQty: number;
  basePrice: number | null;
  unitPrice: number | null;
  liveResolvedCost: number;
}): number {
  const qty = Math.max(input.quantity, 0);
  const pending = Math.min(Math.max(input.pendingCostQty, 0), qty);
  if (qty <= 0 || pending >= qty) return 0;

  const base = input.basePrice ?? 0;
  if (base > 0) return base;
  return input.liveResolvedCost;
}

export function invoiceLineMargin(input: {
  quantity: number;
  pendingCostQty: number;
  unitCost: number;
  taxableAmount: number;
  discountAllocated?: number;
}): {
  lineCogs: number;
  uncostedRevenue: number;
  recognizedProfit: number;
  netRevenueExTax: number;
} {
  const qty = Math.max(input.quantity, 0);
  if (qty <= 0) {
    return { lineCogs: 0, uncostedRevenue: 0, recognizedProfit: 0, netRevenueExTax: 0 };
  }

  const pending = Math.min(Math.max(input.pendingCostQty, 0), qty);
  const costedQty = qty - pending;
  const netRevenue = Math.max(0, input.taxableAmount - Math.max(0, input.discountAllocated ?? 0));
  const lineCogs = round2(input.unitCost * costedQty);
  const uncostedRevenue = round2(netRevenue * (pending / qty));
  const recognizedProfit = round2(netRevenue - lineCogs - uncostedRevenue);
  return {
    lineCogs,
    uncostedRevenue,
    recognizedProfit,
    netRevenueExTax: round2(netRevenue),
  };
}

/** FIFO leftover receipt qty after covering pending sale units (same store + product). */
export function receiptQtyAllocatedToPending(receiptQty: number, pendingQty: number): number {
  if (receiptQty <= 0 || pendingQty <= 0) return 0;
  return Math.min(receiptQty, pendingQty);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
