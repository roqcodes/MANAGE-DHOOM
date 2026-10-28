import { formatCurrencyAmount } from "@/lib/format-currency";
import { formatDateOnly } from "@/lib/format-date";
import type { TabularData, TabularExportSource } from "@/lib/export/tabular-export";

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
    if (ageMinDays === ageMaxDays) return `${ageMinDays} days`;
    return `${ageMinDays}–${ageMaxDays} days`;
  }
  if (ageMinDays != null) return `≥ ${ageMinDays} days`;
  return `≤ ${ageMaxDays} days`;
}

export function formatAgingReportSubtitle(filters: {
  asOf: string;
  ageMinDays?: number;
  ageMaxDays?: number;
  ageFilterDescription?: string;
}) {
  const parts = [`As of ${formatReportAsOf(filters.asOf)}`];
  const ageLabel =
    filters.ageFilterDescription?.trim() ||
    formatAgingDaysRange(filters.ageMinDays, filters.ageMaxDays);
  if (ageLabel) parts.push(ageLabel);
  return parts.join(" · ");
}

export function formatExpiredDaysRange(expiredMinDays?: number, expiredMaxDays?: number) {
  if (expiredMinDays == null && expiredMaxDays == null) return "";
  const suffix = " since expiry";
  if (expiredMinDays != null && expiredMaxDays != null) {
    if (expiredMinDays === expiredMaxDays) {
      return `${expiredMinDays} days${suffix}`;
    }
    return `${expiredMinDays}–${expiredMaxDays} days${suffix}`;
  }
  if (expiredMinDays != null) return `≥ ${expiredMinDays} days${suffix}`;
  return `≤ ${expiredMaxDays} days${suffix}`;
}

export function formatDaysUntilExpiryRange(minDays?: number, maxDays?: number) {
  if (minDays == null && maxDays == null) return "";
  const suffix = " until expiry";
  if (minDays != null && maxDays != null) {
    if (minDays === maxDays) {
      return `${minDays} day${minDays === 1 ? "" : "s"}${suffix}`;
    }
    return `${minDays}–${maxDays} days${suffix}`;
  }
  if (minDays != null) return `≥ ${minDays} days${suffix}`;
  return `≤ ${maxDays} days${suffix}`;
}

export function formatDeadStockReportSubtitle(filters: {
  asOf: string;
  ageMinDays?: number;
  ageMaxDays?: number;
  expiredFilterDescription?: string;
  expiryView?: "expired" | "near_expiry";
  expiryWindowDays?: number;
}) {
  const parts = [`As of ${formatReportAsOf(filters.asOf)}`];
  if (filters.expiryView === "near_expiry") {
    const window = filters.expiryWindowDays ?? 30;
    parts.push(`Expiring within ${window} days`);
    const until =
      filters.expiredFilterDescription?.trim() ||
      formatDaysUntilExpiryRange(filters.ageMinDays, filters.ageMaxDays);
    if (until) parts.push(until);
  } else {
    const range =
      filters.expiredFilterDescription?.trim() ||
      formatExpiredDaysRange(filters.ageMinDays, filters.ageMaxDays);
    if (range) parts.push(range);
  }
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

export type TrialBalanceRow = {
  account_code?: string;
  account_name?: string;
  account_category?: string;
  account_type_name?: string;
  balance?: number;
  period_debit?: number;
  period_credit?: number;
  cumulative_debit?: number;
  cumulative_credit?: number;
};

export function trialBalanceDebit(row: TrialBalanceRow) {
  return Number(row.period_debit ?? row.cumulative_debit ?? 0);
}

export function trialBalanceCredit(row: TrialBalanceRow) {
  return Number(row.period_credit ?? row.cumulative_credit ?? 0);
}

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

  let currentYearEarningsRaw = 0;

  for (const row of rows) {
    const cat = row.account_category ?? "";
    const rawBalance = Number(row.balance ?? 0);

    if (cat === "Income" || cat === "Expense") {
      currentYearEarningsRaw += rawBalance;
    } else if (ASSET_CATEGORIES.has(cat)) {
      assets.push({ ...row, balance: rawBalance });
    } else if (LIABILITY_CATEGORIES.has(cat)) {
      liabilities.push({ ...row, balance: -rawBalance });
    } else if (EQUITY_CATEGORIES.has(cat)) {
      equity.push({ ...row, balance: -rawBalance });
    }
  }

  // Current year earnings: it's part of equity (credit-normal), so flip sign for presentation
  if (currentYearEarningsRaw !== 0) {
    equity.push({
      account_code: "",
      account_name: "Current year earnings",
      account_category: "Equity",
      account_type_name: "Equity",
      balance: -currentYearEarningsRaw,
    });
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

const UUID_LIKE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Catalog-style code for inventory reports (avoid full product UUIDs in grids). */
export function formatReportProductCode(
  value: unknown,
  row?: { product_id?: unknown; product_barcode?: unknown },
) {
  const raw = value == null || value === "" ? "" : String(value).trim();
  if (raw && !UUID_LIKE.test(raw)) return raw;
  const barcode = row?.product_barcode ? String(row.product_barcode).trim() : "";
  if (barcode) return barcode;
  const productId = row?.product_id ? String(row.product_id) : raw;
  if (productId && UUID_LIKE.test(productId)) {
    return `PRD-${productId.slice(0, 8).toUpperCase()}`;
  }
  if (raw) return raw;
  return "—";
}

export function matchesReportSearch(row: Record<string, unknown>, query: string) {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return Object.values(row).some((v) => String(v ?? "").toLowerCase().includes(q));
}
