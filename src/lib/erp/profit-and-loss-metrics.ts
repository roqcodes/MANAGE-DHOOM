/** Mirrors get_erp_profit_and_loss totals (posted GL). */

export type ProfitAndLossTotals = {
  totalIncome: number;
  totalCogs: number;
  totalOperatingExpenses: number;
};

export function grossProfitFromTotals(totals: ProfitAndLossTotals): number {
  return roundMoney(totals.totalIncome - totals.totalCogs);
}

export function netProfitFromTotals(totals: ProfitAndLossTotals): number {
  return roundMoney(totals.totalIncome - totals.totalCogs - totals.totalOperatingExpenses);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
