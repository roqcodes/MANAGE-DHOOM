import { formatCurrencyAmount } from "@/lib/format-currency";
import { formatDateOnly } from "@/lib/format-date";

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

export function exportReportCsv(
  slug: string,
  columns: { key: string; label: string }[],
  rows: Record<string, unknown>[],
) {
  if (rows.length === 0) return;
  const headers = columns.map((c) => c.label);
  const lines = rows.map((row) =>
    columns
      .map((col) => {
        const raw = String(row[col.key] ?? "");
        return raw.includes(",") || raw.includes('"') ? `"${raw.replace(/"/g, '""')}"` : raw;
      })
      .join(","),
  );
  const csv = [headers.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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
