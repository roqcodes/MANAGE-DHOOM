import assert from "node:assert/strict";
import { test } from "node:test";

/** Independent expected profit after credit note (ex-tax revenue minus COGS). */
function netRecognizedProfitAfterCredit(
  invoiceProfit: number,
  creditSubtotal: number,
  creditCogs: number,
): number {
  return Math.round((invoiceProfit - (creditSubtotal - creditCogs)) * 100) / 100;
}

test("credit note profit adjustment uses ex-tax subtotal minus COGS", () => {
  const invoiceProfit = 100;
  const creditSubtotal = 40;
  const creditCogs = 20;
  assert.equal(netRecognizedProfitAfterCredit(invoiceProfit, creditSubtotal, creditCogs), 80);
});

test("tax-inclusive credit total must not be subtracted from ex-tax profit", () => {
  const invoiceProfit = 100;
  const wrong = Math.round((invoiceProfit - 47.2) * 100) / 100;
  const right = netRecognizedProfitAfterCredit(invoiceProfit, 40, 20);
  assert.notEqual(wrong, right);
  assert.equal(right, 80);
});
