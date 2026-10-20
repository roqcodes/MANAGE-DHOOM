/** Mirrors public.erp_invoice_item_margin_components (management reporting, not GL). */

export function invoiceLineMarginComponents(
  quantity: number,
  pendingCostQty: number,
  unitCost: number,
  taxableAmount: number,
): { lineCogs: number; uncostedRevenue: number; recognizedProfit: number } {
  const qty = Math.max(quantity, 0);
  if (qty <= 0) {
    return { lineCogs: 0, uncostedRevenue: 0, recognizedProfit: 0 };
  }

  const pending = Math.min(Math.max(pendingCostQty, 0), qty);
  const costedQty = qty - pending;
  const lineCogs = Math.round(unitCost * costedQty * 100) / 100;
  const uncostedRevenue = Math.round(taxableAmount * (pending / qty) * 100) / 100;
  const recognizedProfit =
    Math.round((taxableAmount - lineCogs - uncostedRevenue) * 100) / 100;

  return { lineCogs, uncostedRevenue, recognizedProfit };
}
