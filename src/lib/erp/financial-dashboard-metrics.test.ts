import assert from "node:assert/strict";
import { test } from "node:test";

import { parseFinancialDashboardKpis } from "./financial-dashboard-metrics";

test("fixed RPC maps revenue and net income from distinct fields", () => {
  const kpis = parseFinancialDashboardKpis({
    revenue_ytd: 1390,
    total_income_ytd: 1390,
    gross_profit_ytd: 590,
    net_income_ytd: 590,
    net_profit_ytd: 590,
    cogs_ytd: 800,
  });
  assert.equal(kpis.revenue_ytd, 1390);
  assert.equal(kpis.net_income_ytd, 590);
  assert.equal(kpis.net_profit_ytd, 590);
});

test("legacy RPC treats net_income_ytd as revenue when it differs from net profit", () => {
  const kpis = parseFinancialDashboardKpis({
    net_income_ytd: 1390,
    gross_profit_ytd: 590,
    net_profit_ytd: 590,
    cogs_ytd: 800,
  });
  assert.equal(kpis.revenue_ytd, 1390);
  assert.equal(kpis.net_income_ytd, 590);
});
