/**
 * Normalizes `get_erp_financial_dashboard` KPI fields across RPC versions.
 * Legacy RPC mapped net_income_ytd → P&L total_income (revenue); fixed RPC uses net profit.
 */

export type FinancialDashboardKpis = {
  /** P&L total_income (sales revenue ex tax, period). */
  revenue_ytd: number;
  gross_profit_ytd: number;
  /** Bottom-line profit (same as net_profit_ytd). */
  net_income_ytd: number;
  net_profit_ytd: number;
};

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function approxEqual(a: number, b: number, epsilon = 0.02): boolean {
  return Math.abs(a - b) <= epsilon;
}

/**
 * Derive revenue / net income from a raw dashboard RPC payload.
 * When `revenue_ytd` is absent, detects legacy net_income_ytd = total_income.
 */
export function parseFinancialDashboardKpis(
  raw: Record<string, unknown>,
): FinancialDashboardKpis {
  const netProfit = num(raw.net_profit_ytd);
  const grossProfit = num(raw.gross_profit_ytd);
  const cogs = num(raw.cogs_ytd);

  const explicitRevenue = num(raw.revenue_ytd ?? raw.total_income_ytd);
  if (explicitRevenue > 0 || raw.revenue_ytd != null || raw.total_income_ytd != null) {
    const netIncome = num(raw.net_income_ytd ?? netProfit);
    return {
      revenue_ytd: explicitRevenue,
      gross_profit_ytd: grossProfit,
      net_income_ytd: netIncome,
      net_profit_ytd: netProfit,
    };
  }

  const legacyNetIncomeField = num(raw.net_income_ytd);
  const legacyFieldIsRevenue =
    !approxEqual(legacyNetIncomeField, netProfit) &&
    (approxEqual(legacyNetIncomeField, grossProfit + cogs) ||
      (grossProfit > 0 && legacyNetIncomeField > netProfit + 0.02));

  if (legacyFieldIsRevenue) {
    return {
      revenue_ytd: legacyNetIncomeField,
      gross_profit_ytd: grossProfit,
      net_income_ytd: netProfit,
      net_profit_ytd: netProfit,
    };
  }

  return {
    revenue_ytd: legacyNetIncomeField,
    gross_profit_ytd: grossProfit,
    net_income_ytd: legacyNetIncomeField,
    net_profit_ytd: netProfit,
  };
}
