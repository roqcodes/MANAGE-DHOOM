import { formatCurrencyAmount } from "@/lib/format-currency";
import { formatDateOnly } from "@/lib/format-date";
import type { TabularData, TabularExportSource } from "@/lib/export/tabular-export";
import { downloadTabularCsv } from "@/lib/export/tabular-export";

export function formatReportCell(value: unknown, format?: string) {
  if (value == null || value === "") return "—";
  if (format === "currency" && typeof value === "number") return formatCurrencyAmount(value);
  if (format === "number" && typeof value === "number") {
    return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 3 });
  }
  if (format === "percent" && typeof value === "number") return `${value.toFixed(2)}%`;
  if (format === "date" && typeof value === "string") return formatDateOnly(value);
  return String(value);
}

export function formatReportPeriodRange(from: string, to: string) {
  if (!from && !to) return "All dates";
  if (from && to && from === to) return formatDateOnly(from);
  if (from && to) return `${formatDateOnly(from)} – ${formatDateOnly(to)}`;
  if (from) return `From ${formatDateOnly(from)}`;
  return `Through ${formatDateOnly(to)}`;
}

export function formatReportAsOf(asOf: string) {
  return asOf ? formatDateOnly(asOf) : "Today";
}

export function reportFiltersSubtitle(
  filters: { dateFrom: string; dateTo: string; asOf: string },
  mode: "range" | "asOf" = "range",
) {
  if (mode === "asOf") return `As of ${formatReportAsOf(filters.asOf)}`;
  return formatReportPeriodRange(filters.dateFrom, filters.dateTo);
}

export function formatAgingDaysRange(ageMinDays?: number, ageMaxDays?: number) {
  if (ageMinDays == null && ageMaxDays == null) return "";
  if (ageMinDays != null && ageMaxDays != null) {
    if (ageMinDays === ageMaxDays) return `Age ${ageMinDays} days`;
    return `Age ${ageMinDays}–${ageMaxDays} days`;
  }
  if (ageMinDays != null) return `Age ≥ ${ageMinDays} days`;
  return `Age ≤ ${ageMaxDays} days`;
}

export function formatAgingReportSubtitle(filters: {
  asOf: string;
  ageMinDays?: number;
  ageMaxDays?: number;
}) {
  const parts = [`As of ${formatReportAsOf(filters.asOf)}`];
  const ageLabel = formatAgingDaysRange(filters.ageMinDays, filters.ageMaxDays);
  if (ageLabel) parts.push(ageLabel);
  return parts.join(" · ");
}

export type ReportColumnDef = {
  key: string;
  label: string;
  format?: string;
};

export function reportColumnsToTabular(
  columns: ReportColumnDef[],
  rows: Record<string, unknown>[],
): TabularData {
  return {
    headers: columns.map((c) => c.label),
    rows: rows.map((row) =>
      columns.map((col) => formatReportCell(row[col.key], col.format)),
    ),
  };
}

export function buildReportExportSource(opts: {
  slug: string;
  title: string;
  columns: ReportColumnDef[];
  getRows: () => Record<string, unknown>[];
  getSubtitle?: () => string;
}): TabularExportSource {
  return {
    baseFilename: opts.slug,
    title: opts.title,
    getSubtitle: opts.getSubtitle,
    getTabular: () => {
      const rows = opts.getRows();
      if (rows.length === 0) return null;
      return reportColumnsToTabular(opts.columns, rows);
    },
  };
}

/** @deprecated Prefer DataExportMenu with buildReportExportSource */
export function exportReportCsv(
  slug: string,
  columns: { key: string; label: string; format?: string }[],
  rows: Record<string, unknown>[],
) {
  if (rows.length === 0) return;
  const { headers, rows: body } = reportColumnsToTabular(columns, rows);
  downloadTabularCsv({ baseFilename: slug, headers, rows: body });
}

export type TrialBalanceRow = {
  account_code?: string;
  account_name?: string;
  account_category?: string;
  account_type_name?: string;
  balance?: number;
  period_debit?: number;
  period_credit?: number;
};

export const TRIAL_BALANCE_SECTIONS: { title: string; categories: string[] }[] = [
  { title: "Assets", categories: ["Assets", "AccountsRecievable"] },
  { title: "Liabilities", categories: ["Liability", "AccountsPayable"] },
  { title: "Equities", categories: ["Equity"] },
  { title: "Expense", categories: ["Expense"] },
  { title: "Income", categories: ["Income"] },
];

export function partitionTrialBalanceSections(rows: TrialBalanceRow[]) {
  return TRIAL_BALANCE_SECTIONS.map((section) => ({
    title: section.title,
    rows: rows.filter((r) => section.categories.includes(r.account_category ?? "")),
  })).filter((s) => s.rows.length > 0);
}

export function formatDebitCreditAmount(debit: unknown, credit: unknown) {
  const d = Number(debit ?? 0);
  const c = Number(credit ?? 0);
  if (d > 0) return `${formatCurrencyAmount(d)} Dr`;
  if (c > 0) return `${formatCurrencyAmount(c)} Cr`;
  return "—";
}

const LIABILITY_CATEGORIES = new Set(["Liability", "AccountsPayable"]);
const ASSET_CATEGORIES = new Set(["Assets", "AccountsRecievable"]);
const EQUITY_CATEGORIES = new Set(["Equity"]);

export function partitionBalanceSheetRows(rows: TrialBalanceRow[]) {
  const assets: TrialBalanceRow[] = [];
  const liabilities: TrialBalanceRow[] = [];
  const equity: TrialBalanceRow[] = [];

  for (const row of rows) {
    const cat = row.account_category ?? "";
    if (ASSET_CATEGORIES.has(cat)) assets.push(row);
    else if (LIABILITY_CATEGORIES.has(cat)) liabilities.push(row);
    else if (EQUITY_CATEGORIES.has(cat)) equity.push(row);
  }

  const sum = (list: TrialBalanceRow[]) =>
    list.reduce((acc, r) => acc + Number(r.balance ?? 0), 0);

  return {
    assets,
    liabilities,
    equity,
    totalAssets: sum(assets),
    totalLiabilities: sum(liabilities),
    totalEquity: sum(equity),
  };
}

export function groupRowsByTypeName(rows: TrialBalanceRow[]) {
  const groups = new Map<string, TrialBalanceRow[]>();
  for (const row of rows) {
    const key = row.account_type_name?.trim() || "Other";
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function matchesReportSearch(row: Record<string, unknown>, query: string) {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return Object.values(row).some((v) => String(v ?? "").toLowerCase().includes(q));
}
