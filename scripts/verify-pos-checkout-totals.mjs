/**
 * W4 unit checks for derivePosCheckoutHeaderTotals (no DB).
 * Run: node scripts/verify-pos-checkout-totals.mjs
 */

function roundPosMoney2(n) {
  return Math.round(n * 100) / 100;
}

function derivePosCheckoutHeaderTotals(lines, tax, discount) {
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

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const multiLine = derivePosCheckoutHeaderTotals(
  [
    { finalPrice: 90, quantity: 2 },
    { finalPrice: 50, quantity: 1 },
  ],
  0,
  0,
);
assert(multiLine.totalAmount === 230, `expected 230, got ${multiLine.totalAmount}`);
assert(multiLine.subtotal === 230, `expected subtotal 230, got ${multiLine.subtotal}`);

const withDiscount = derivePosCheckoutHeaderTotals(
  [{ finalPrice: 80, quantity: 2 }],
  0,
  20,
);
assert(withDiscount.subtotal === 180, `subtotal 180, got ${withDiscount.subtotal}`);
assert(withDiscount.totalAmount === 160, `total 160, got ${withDiscount.totalAmount}`);

const withTax = derivePosCheckoutHeaderTotals(
  [{ finalPrice: 100, quantity: 1 }],
  5,
  0,
);
assert(withTax.totalAmount === 105, `total 105, got ${withTax.totalAmount}`);

console.log("verify-pos-checkout-totals: OK");
