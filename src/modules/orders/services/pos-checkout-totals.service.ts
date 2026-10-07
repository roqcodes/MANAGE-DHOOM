/** Match billing UI money rounding (2 decimal places). */
export function roundPosMoney2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type PosCheckoutLineTotalInput = {
  finalPrice: number;
  quantity: number;
};

/**
 * POS header totals from accepted line final prices.
 * Preserves billing formula: subtotal − discount + tax = total, where
 * sum(finalPrice × qty) = subtotal − discount (merchandise net).
 */
export function derivePosCheckoutHeaderTotals(
  lines: PosCheckoutLineTotalInput[],
  tax: number,
  discount: number,
): { subtotal: number; tax: number; discount: number; totalAmount: number } {
  const merchandise = lines.reduce(
    (sum, line) =>
      sum + roundPosMoney2(line.finalPrice * Math.max(1, line.quantity)),
    0,
  );
  const safeTax = Math.max(0, Number.isFinite(tax) ? tax : 0);
  const safeDiscount = Math.max(0, Number.isFinite(discount) ? discount : 0);

  return {
    subtotal: roundPosMoney2(merchandise + safeDiscount),
    tax: safeTax,
    discount: safeDiscount,
    totalAmount: Math.max(0, roundPosMoney2(merchandise + safeTax)),
  };
}
