import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { invoiceLineMarginComponents } from "./invoice-line-profit-metrics";

describe("invoiceLineMarginComponents", () => {
  it("treats fully uncosted sale as zero recognized profit", () => {
    const m = invoiceLineMarginComponents(20, 20, 0, 200);
    assert.equal(m.lineCogs, 0);
    assert.equal(m.uncostedRevenue, 200);
    assert.equal(m.recognizedProfit, 0);
  });

  it("allocates partial receipt cost to half the line", () => {
    const m = invoiceLineMarginComponents(20, 10, 5, 200);
    assert.equal(m.lineCogs, 50);
    assert.equal(m.uncostedRevenue, 100);
    assert.equal(m.recognizedProfit, 50);
  });

  it("fully costed line matches revenue minus COGS", () => {
    const m = invoiceLineMarginComponents(20, 0, 5, 200);
    assert.equal(m.lineCogs, 100);
    assert.equal(m.uncostedRevenue, 0);
    assert.equal(m.recognizedProfit, 100);
  });
});
