import "server-only";

import type { DashboardChartGranularity, DashboardMonthlySeriesPoint } from "@/common/admin/types";
import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { invokeRpc } from "@/lib/integrations/supabase/rpc";
import type { ErpFinancialDashboard, ErpReconciliationSnapshot } from "@/common/erp/finance-types";
import { roundMoney } from "@/lib/decimal-precision";
import { parseFinancialDashboardKpis } from "@/lib/erp/financial-dashboard-metrics";

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

type ProfitAndLossResult = {
  total_income?: number;
  total_cogs?: number;
  total_operating_expenses?: number;
  total_expenses?: number;
  gross_profit?: number;
  net_profit?: number;
};

type JournalLineRow = {
  credit_amount: number | null;
  debit_amount: number | null;
  accounts: {
    account_types: { account_category: string } | null;
  } | null;
};

type JournalEntryRow = {
  transaction_date: string;
  journal_entry_lines: JournalLineRow[] | null;
};

function normalizeFinancialDashboard(
  raw: ErpFinancialDashboard | Record<string, unknown>,
): ErpFinancialDashboard {
  const dash = raw as ErpFinancialDashboard;
  const kpis = parseFinancialDashboardKpis(raw as Record<string, unknown>);
  return {
    ...dash,
    revenue_ytd: kpis.revenue_ytd,
    total_income_ytd: kpis.revenue_ytd,
    gross_profit_ytd: kpis.gross_profit_ytd,
    net_income_ytd: kpis.net_income_ytd,
    net_profit_ytd: kpis.net_profit_ytd,
  };
}

function defaultDashboardDateRange() {
  const today = new Date();
  const year = today.getFullYear();
  return {
    dateFrom: `${year}-01-01`,
    dateTo: today.toISOString().slice(0, 10),
  };
}

function toLocalIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function emptyBucket(label: string, monthNum: number, periodKey: string): DashboardMonthlySeriesPoint {
  return {
    month: label,
    monthNum,
    monthKey: periodKey,
    income: 0,
    cogs: 0,
    expenses: 0,
    netProfit: 0,
  };
}

function formatDayLabel(date: Date) {
  const day = date.getDate();
  const month = MONTH_LABELS[date.getMonth()];
  return `${String(day).padStart(2, "0")} ${month}`;
}

function daysInRange(dateFrom: string, dateTo: string) {
  const buckets: DashboardMonthlySeriesPoint[] = [];
  const cursor = new Date(`${dateFrom}T00:00:00`);
  const end = new Date(`${dateTo}T00:00:00`);

  while (cursor <= end) {
    const iso = toLocalIsoDate(cursor);
    buckets.push(emptyBucket(formatDayLabel(cursor), cursor.getDate(), iso));
    cursor.setDate(cursor.getDate() + 1);
  }

  return buckets;
}

function monthsInRange(dateFrom: string, dateTo: string) {
  const start = new Date(`${dateFrom}T00:00:00`);
  const end = new Date(`${dateTo}T00:00:00`);
  const spansMultipleYears = start.getFullYear() !== end.getFullYear();
  const buckets: DashboardMonthlySeriesPoint[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

  while (cursor <= endMonth) {
    const year = cursor.getFullYear();
    const monthIndex = cursor.getMonth();
    const monthNum = monthIndex + 1;
    const key = `${year}-${String(monthNum).padStart(2, "0")}`;
    buckets.push(
      emptyBucket(
        spansMultipleYears
          ? `${MONTH_LABELS[monthIndex]} '${String(year).slice(-2)}`
          : MONTH_LABELS[monthIndex],
        monthNum,
        key,
      ),
    );
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return buckets;
}

async function callProfitAndLoss(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  dateFrom: string,
  dateTo: string,
  storeId: string,
): Promise<ProfitAndLossResult> {
  const { data, error } = await (
    supabase as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => ReturnType<typeof supabase.rpc>;
    }
  ).rpc("get_erp_profit_and_loss", {
    p_date_from: dateFrom,
    p_date_to: dateTo,
    p_store_id: storeId,
  });
  if (error) throw new Error(error.message);
  return (data ?? {}) as ProfitAndLossResult;
}

/** P&L chart buckets from posted journals (day or month granularity). */
export async function buildStorePlSeries(
  storeId: string,
  dateFrom?: string,
  dateTo?: string,
  granularity: DashboardChartGranularity = "month",
): Promise<DashboardMonthlySeriesPoint[]> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const range = defaultDashboardDateRange();
  const from = dateFrom ?? range.dateFrom;
  const to = dateTo ?? range.dateTo;

  const buckets =
    granularity === "day" ? daysInRange(from, to) : monthsInRange(from, to);
  const bucketByKey = new Map(
    buckets.map((bucket) => [bucket.monthKey ?? `${bucket.monthNum}`, bucket]),
  );

  const rpc = await invokeRpc(supabase, "get_erp_store_pl_series", {
    p_store_id: storeId,
    p_date_from: from,
    p_date_to: to,
    p_granularity: granularity,
  });

  if (!rpc.error && rpc.data) {
    const rows = Array.isArray(rpc.data)
      ? rpc.data
      : typeof rpc.data === "string"
        ? (JSON.parse(rpc.data) as unknown)
        : rpc.data;
    if (Array.isArray(rows)) {
      const byKey = new Map(
        (
          rows as Array<{
            period_key: string;
            income: number;
            cogs?: number;
            expenses: number;
            net_profit: number;
          }>
        ).map((row) => [row.period_key, row]),
      );
      for (const bucket of buckets) {
        const key = bucket.monthKey ?? `${bucket.monthNum}`;
        const row = byKey.get(key);
        if (!row) continue;
        bucket.income = Number(row.income ?? 0);
        bucket.cogs = Number(row.cogs ?? 0);
        bucket.expenses = Number(row.expenses ?? 0);
        bucket.netProfit = Number(
          row.net_profit ?? bucket.income - bucket.cogs - bucket.expenses,
        );
      }
      return buckets;
    }
  }

  const { data, error } = await supabase
    .from("journal_entries")
    .select(
      `
      transaction_date,
      journal_entry_lines (
        credit_amount,
        debit_amount,
        accounts (
          account_types (account_category)
        )
      )
    `,
    )
    .eq("status", "posted")
    .eq("store_id", storeId)
    .gte("transaction_date", from)
    .lte("transaction_date", to);

  if (error) throw new Error(error.message);

  for (const entry of (data ?? []) as JournalEntryRow[]) {
    const periodKey =
      granularity === "day"
        ? entry.transaction_date.slice(0, 10)
        : entry.transaction_date.slice(0, 7);
    const bucket = bucketByKey.get(periodKey);
    if (!bucket) continue;

    for (const line of entry.journal_entry_lines ?? []) {
      const category = line.accounts?.account_types?.account_category;
      const credit = Number(line.credit_amount ?? 0);
      const debit = Number(line.debit_amount ?? 0);
      if (category === "Income") {
        bucket.income += credit - debit;
      } else if (category === "Expense") {
        bucket.expenses += debit - credit;
      }
    }
  }

  for (const bucket of buckets) {
    bucket.income = roundMoney(bucket.income);
    bucket.expenses = roundMoney(bucket.expenses);
    bucket.netProfit = roundMoney(bucket.income - bucket.expenses);
  }

  return buckets;
}

/** Branch-scoped financial summary aligned with the Profit & Loss report (posted journals). */
export async function getStoreFinancialDashboard(
  storeId: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<ErpFinancialDashboard> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const range = defaultDashboardDateRange();
  const from = dateFrom ?? range.dateFrom;
  const to = dateTo ?? range.dateTo;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const salesSince = thirtyDaysAgo.toISOString().slice(0, 10);

  const [snapRes, dashRes] = await Promise.all([
    invokeRpc(supabase, "get_admin_store_finance_snapshot", {
      p_store_id: storeId,
      p_date_from: from,
      p_date_to: to,
    }),
    supabase.rpc("get_erp_financial_dashboard", {
      p_date_from: from,
      p_date_to: to,
      p_store_id: storeId,
    }),
  ]);

  if (!snapRes.error && snapRes.data && typeof snapRes.data === "object") {
    const snap = snapRes.data as {
      accounts_receivable?: number;
      accounts_payable?: number;
      invoice_status?: Array<{ status: string; count: number; total: number }>;
      daily_sales?: Array<{ day: string; total: number }>;
      recent_invoices?: Array<{
        id: string;
        invoice_number: string;
        user_id: string;
        total_amount: number;
        created_at: string;
        status: string;
      }>;
    };
    if (dashRes.error) throw new Error(dashRes.error.message);
    const dash = normalizeFinancialDashboard((dashRes.data ?? {}) as ErpFinancialDashboard);
    return {
      accounts_receivable: Number(snap.accounts_receivable ?? dash.accounts_receivable ?? 0),
      accounts_payable: Number(snap.accounts_payable ?? dash.accounts_payable ?? 0),
      ar_gl: Number(dash.ar_gl ?? 0),
      ap_gl: Number(dash.ap_gl ?? 0),
      revenue_ytd: dash.revenue_ytd,
      total_income_ytd: dash.total_income_ytd,
      net_income_ytd: dash.net_income_ytd,
      cogs_ytd: Number(dash.cogs_ytd ?? 0),
      purchases_ytd: Number(dash.purchases_ytd ?? 0),
      gross_profit_ytd: dash.gross_profit_ytd,
      expenses_ytd: Number(dash.expenses_ytd ?? 0),
      net_profit_ytd: dash.net_profit_ytd,
      date_from: dash.date_from,
      date_to: dash.date_to,
      low_stock_count: Number(dash.low_stock_count ?? 0),
      daily_sales: (snap.daily_sales ?? []).map((row) => ({
        day: row.day,
        total: Number(row.total ?? 0),
      })),
      invoice_status_ytd: (snap.invoice_status ?? []).map((row) => ({
        status: row.status,
        count: Number(row.count ?? 0),
        total: Number(row.total ?? 0),
      })),
      recent_invoices: snap.recent_invoices ?? [],
    } as ErpFinancialDashboard & {
      recent_invoices: Array<{
        id: string;
        invoice_number: string;
        user_id: string;
        total_amount: number;
        created_at: string;
        status: string;
      }>;
    };
  }

  const [arResult, apResult, lowStockResult, invoiceStatusResult, dailySalesResult, fallbackDash] =
    await Promise.all([
      supabase
        .from("invoices")
        .select("balance_due")
        .eq("store_id", storeId)
        .in("status", ["issued", "partial", "paid", "overdue"])
        .gt("balance_due", 0),
      supabase
        .from("erp_purchase_bills")
        .select("balance_due")
        .eq("store_id", storeId)
        .in("status", ["finalized", "partial", "paid"])
        .gt("balance_due", 0),
      supabase
        .from("store_product_inventory")
        .select("stock, product_id")
        .eq("store_id", storeId),
      supabase
        .from("invoices")
        .select("status, total_amount, created_at")
        .eq("store_id", storeId)
        .gte("created_at", `${from}T00:00:00`)
        .lte("created_at", `${to}T23:59:59`),
      supabase
        .from("invoices")
        .select("created_at, total_amount")
        .eq("store_id", storeId)
        .in("status", ["issued", "partial", "paid"])
        .gte("created_at", `${salesSince}T00:00:00`),
      Promise.resolve(dashRes),
    ]);

  const accountsReceivable = (arResult.data ?? []).reduce(
    (sum, row) => sum + Number(row.balance_due ?? 0),
    0,
  );
  const accountsPayable = (apResult.data ?? []).reduce(
    (sum, row) => sum + Number(row.balance_due ?? 0),
    0,
  );

  let lowStockCount = 0;
  const storeStockRows = lowStockResult.data ?? [];
  const reorderThreshold = 10;
  for (const row of storeStockRows) {
    const stock = Math.max(0, Math.floor(Number(row.stock ?? 0)));
    if (stock < 1) lowStockCount += 1;
    else if (stock < reorderThreshold) lowStockCount += 1;
  }

  const statusAgg = new Map<string, { count: number; total: number }>();
  for (const inv of invoiceStatusResult.data ?? []) {
    const status = inv.status ?? "unknown";
    const cur = statusAgg.get(status) ?? { count: 0, total: 0 };
    cur.count += 1;
    cur.total += Number(inv.total_amount ?? 0);
    statusAgg.set(status, cur);
  }

  const dailyAgg = new Map<string, number>();
  for (const inv of dailySalesResult.data ?? []) {
    const day = inv.created_at?.slice(0, 10);
    if (!day) continue;
    dailyAgg.set(day, (dailyAgg.get(day) ?? 0) + Number(inv.total_amount ?? 0));
  }
  const dailySales = [...dailyAgg.entries()]
    .map(([day, total]) => ({ day, total }))
    .sort((a, b) => a.day.localeCompare(b.day));

  if (fallbackDash.error) throw new Error(fallbackDash.error.message);
  const dash = normalizeFinancialDashboard((fallbackDash.data ?? {}) as ErpFinancialDashboard);

  return {
    accounts_receivable: accountsReceivable,
    accounts_payable: accountsPayable,
    ar_gl: Number(dash.ar_gl ?? 0),
    ap_gl: Number(dash.ap_gl ?? 0),
    revenue_ytd: dash.revenue_ytd,
    total_income_ytd: dash.total_income_ytd,
    net_income_ytd: dash.net_income_ytd,
    cogs_ytd: Number(dash.cogs_ytd ?? 0),
    purchases_ytd: Number(dash.purchases_ytd ?? 0),
    gross_profit_ytd: dash.gross_profit_ytd,
    expenses_ytd: Number(dash.expenses_ytd ?? 0),
    net_profit_ytd: dash.net_profit_ytd,
    date_from: dash.date_from,
    date_to: dash.date_to,
    low_stock_count: lowStockCount,
    daily_sales: dailySales,
    invoice_status_ytd: [...statusAgg.entries()].map(([status, v]) => ({
      status,
      count: v.count,
      total: v.total,
    })),
  };
}

export async function getFinancialDashboard(
  dateFrom?: string,
  dateTo?: string,
): Promise<ErpFinancialDashboard> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const range = defaultDashboardDateRange();
  const { data, error } = await supabase.rpc("get_erp_financial_dashboard", {
    p_date_from: dateFrom ?? range.dateFrom,
    p_date_to: dateTo ?? range.dateTo,
    p_store_id: null,
  });
  if (error) throw new Error(error.message);
  return normalizeFinancialDashboard((data ?? {}) as ErpFinancialDashboard);
}

export async function getReconciliationSnapshot(): Promise<ErpReconciliationSnapshot> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_erp_reconciliation_snapshot");
  if (error) throw new Error(error.message);
  return data as ErpReconciliationSnapshot;
}
