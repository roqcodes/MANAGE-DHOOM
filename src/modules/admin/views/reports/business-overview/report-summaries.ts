import type { ReportColumn } from "@/common/erp/report-types";
import { formatCurrencyAmount } from "@/lib/format-currency";

export type ColumnAggregateMode = "sum" | "avg" | "none";

const AVG_KEY_PATTERN = /percent|_pct|profit_percent|vat_percentage|avg_/i;
const SKIP_AGG_PATTERN =
  /running_balance|opening_balance|^balance$|age_days|bucket_|invoice_number|payment_number/i;

export function columnAggregateMode(col: ReportColumn): ColumnAggregateMode {
  if (col.format !== "currency" && col.format !== "number") return "none";
  if (SKIP_AGG_PATTERN.test(col.key)) return "none";
  if (AVG_KEY_PATTERN.test(col.key)) return "avg";
  return "sum";
}

export function computeColumnAggregates(
  columns: ReportColumn[],
  rows: Record<string, unknown>[],
): Record<string, { sum: number; avg: number | null }> {
  const out: Record<string, { sum: number; avg: number | null }> = {};
  for (const col of columns) {
    if (columnAggregateMode(col) === "none") continue;
    const nums = rows
      .map((r) => Number(r[col.key]))
      .filter((n) => Number.isFinite(n));
    const sum = nums.reduce((a, b) => a + b, 0);
    out[col.key] = { sum, avg: nums.length > 0 ? sum / nums.length : null };
  }
  return out;
}

export function formatAggregateCell(col: ReportColumn, agg: { sum: number; avg: number | null }): string {
  const mode = columnAggregateMode(col);
  const value = mode === "avg" ? agg.avg : agg.sum;
  if (value == null || !Number.isFinite(value)) return "—";
  if (col.format === "currency") return formatCurrencyAmount(value);
  if (mode === "avg") {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

const KPI_KEY_PRIORITY = [
  "total_amount",
  "total_sales",
  "net_amount",
  "total_due",
  "balance",
  "balance_due",
  "net_payable",
  "due_tax",
  "total_payment",
  "total",
  "stock",
  "profit",
  "tax_amount",
  "gst_amount",
  "period_debit",
  "period_credit",
  "debit_amount",
  "credit_amount",
];

export type ReportKpiItem = { label: string; value: string };

export function buildReportKpis(
  columns: ReportColumn[],
  rows: Record<string, unknown>[],
  aggregates: Record<string, { sum: number; avg: number | null }>,
  extra?: ReportKpiItem[],
): ReportKpiItem[] {
  const items: ReportKpiItem[] = [];

  if (extra?.length) {
    items.push(...extra);
  }

  if (rows.length > 0 && !items.some((i) => i.label === "Rows")) {
    items.push({ label: "Rows", value: rows.length.toLocaleString() });
  }

  const summable = columns
    .filter((c) => columnAggregateMode(c) === "sum" && c.format === "currency")
    .sort((a, b) => {
      const ai = KPI_KEY_PRIORITY.indexOf(a.key);
      const bi = KPI_KEY_PRIORITY.indexOf(b.key);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

  for (const col of summable) {
    if (items.length >= 5) break;
    const agg = aggregates[col.key];
    if (!agg) continue;
    if (items.some((i) => i.label === col.label)) continue;
    items.push({ label: col.label, value: formatAggregateCell(col, agg) });
  }

  const avgCol = columns.find((c) => columnAggregateMode(c) === "avg");
  if (avgCol && aggregates[avgCol.key]?.avg != null && items.length < 6) {
    items.push({
      label: `Avg ${avgCol.label}`,
      value: formatAggregateCell(avgCol, aggregates[avgCol.key]),
    });
  }

  return items.slice(0, 6);
}

export function hasAggregatableColumns(columns: ReportColumn[]): boolean {
  return columns.some((c) => columnAggregateMode(c) !== "none");
}
