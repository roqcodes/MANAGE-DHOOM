import assert from "node:assert/strict";
import { test } from "node:test";

import { grossProfitFromTotals, netProfitFromTotals } from "./profit-and-loss-metrics";

test("gross profit is income minus COGS", () => {
  assert.equal(
    grossProfitFromTotals({ totalIncome: 1000, totalCogs: 400, totalOperatingExpenses: 0 }),
    600,
  );
});

test("net profit subtracts operating expenses after COGS", () => {
  assert.equal(
    netProfitFromTotals({ totalIncome: 1000, totalCogs: 400, totalOperatingExpenses: 150 }),
    450,
  );
});

test("deferred COGS increases expense side without double-counting income", () => {
  const before = netProfitFromTotals({
    totalIncome: 500,
    totalCogs: 100,
    totalOperatingExpenses: 50,
  });
  const afterDeferredCogs = netProfitFromTotals({
    totalIncome: 500,
    totalCogs: 250,
    totalOperatingExpenses: 50,
  });
  assert.equal(before - afterDeferredCogs, 150);
});
