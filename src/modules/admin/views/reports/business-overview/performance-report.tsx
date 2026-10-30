"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Building2,
  ChevronRight,
  Package,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ReportDefinition } from "@/common/erp/report-types";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { AdminDetailBodySkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BusinessReportLayout } from "./business-report-layout";
import {
  buildReportExportSource,
  formatReportPeriodRange,
} from "./report-format";
import { useBusinessReportFilters } from "./use-business-report-filters";
import { useErpReportFetch } from "./use-erp-report-fetch";

const CHART_SALES = "hsl(var(--primary))";
const CHART_COLLECTIONS = "hsl(142 71% 45%)";
const PIE_COLORS = [
  "hsl(var(--primary))",
  "hsl(142 71% 45%)",
  "hsl(38 92% 50%)",
  "hsl(262 83% 58%)",
  "hsl(199 89% 48%)",
  "hsl(var(--muted-foreground))",
];

/** Minimal split for side-by-side rank lists (leaders | laggards). */
const dualRankGrid = "grid gap-4 p-4 lg:grid-cols-2 lg:gap-0";
const dualRankColStart =
  "min-w-0 border-b border-border/50 pb-4 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-5";
const dualRankColEnd = "min-w-0 lg:pl-5";

const splitTwoGrid = "grid gap-4 p-4 sm:grid-cols-2 sm:gap-0";
const splitTwoColStart = "min-w-0 border-b border-border/50 pb-4 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-4";
const splitTwoColEnd = "min-w-0 sm:pl-4";

const splitThreeGrid =
  "grid gap-4 p-4 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-border/50";
const splitThreeCol = "min-w-0 sm:px-4 first:sm:pl-0 last:sm:pr-0";

type RankRow = Record<string, unknown>;

type PerformancePayload = {
  kpis?: Record<string, unknown>;
  sales_trend?: Array<{ bucket: string; sales: number; collections: number }>;
  items?: Record<string, RankRow[]>;
  salesmen?: Record<string, RankRow[]>;
  brands?: Record<string, RankRow[]>;
  categories?: Record<string, RankRow[]>;
  customers?: Record<string, RankRow[]>;
  vendors?: Record<string, RankRow[]>;
};

function parsePayload(raw: unknown): PerformancePayload | null {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw === "string") {
    try {
      return parsePayload(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  return raw as PerformancePayload;
}

function asRows(value: unknown): RankRow[] {
  return Array.isArray(value) ? (value as RankRow[]) : [];
}

function rowMatchesSearch(row: RankRow, q: string, keys: string[]) {
  if (!q.trim()) return true;
  const needle = q.trim().toLowerCase();
  return keys.some((k) => String(row[k] ?? "").toLowerCase().includes(needle));
}

function filterRows(rows: RankRow[], q: string, keys: string[]) {
  return rows.filter((r) => rowMatchesSearch(r, q, keys));
}

function ProductThumb({ url, name }: { url: string | null | undefined; name: string }) {
  if (url?.trim()) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className="size-11 shrink-0 rounded-lg border border-border object-cover"
      />
    );
  }
  return (
    <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/60 text-muted-foreground">
      <Package className="size-5" aria-hidden />
      <span className="sr-only">{name}</span>
    </div>
  );
}

function KpiLinkCard({
  label,
  value,
  href,
  hint,
}: {
  label: string;
  value: string;
  href: string;
  hint?: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-xl border border-border bg-card px-4 py-3 transition hover:border-primary/30 hover:bg-muted/30"
    >
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="mt-1 text-lg font-semibold tabular-nums tracking-tight">{value}</span>
      {hint ? (
        <span className="mt-1 text-[11px] text-muted-foreground group-hover:text-primary">{hint}</span>
      ) : null}
    </Link>
  );
}

function RankList({
  rows,
  renderPrimary,
  renderMetric,
  emptyLabel = "No data",
}: {
  rows: RankRow[];
  renderPrimary: (row: RankRow, index: number) => ReactNode;
  renderMetric: (row: RankRow) => ReactNode;
  emptyLabel?: string;
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {rows.map((row, index) => (
        <li key={String(row.id ?? row.product_id ?? row.user_id ?? row.vendor_id ?? index)} className="flex items-center gap-3 py-2.5">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold tabular-nums text-muted-foreground">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">{renderPrimary(row, index)}</div>
          <div className="shrink-0 text-right text-sm font-semibold tabular-nums">{renderMetric(row)}</div>
        </li>
      ))}
    </ul>
  );
}

function DualRankCard({
  title,
  icon: Icon,
  leaders,
  laggards,
  leadersLabel,
  laggardsLabel,
  renderPrimary,
  renderLeaderMetric,
  renderLaggardMetric,
  footerLink,
}: {
  title: string;
  icon: typeof TrendingUp;
  leaders: RankRow[];
  laggards: RankRow[];
  leadersLabel: string;
  laggardsLabel: string;
  renderPrimary: (row: RankRow) => ReactNode;
  renderLeaderMetric: (row: RankRow) => ReactNode;
  renderLaggardMetric: (row: RankRow) => ReactNode;
  footerLink?: { href: string; label: string };
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-2 border-b bg-muted/20 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4" />
          </span>
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
        {footerLink ? (
          <Link href={footerLink.href} className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline">
            {footerLink.label}
            <ChevronRight className="size-3.5" />
          </Link>
        ) : null}
      </CardHeader>
      <CardContent className={dualRankGrid}>
        <div className={dualRankColStart}>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            <ArrowUpRight className="size-3.5" />
            {leadersLabel}
          </p>
          <RankList rows={leaders} renderPrimary={renderPrimary} renderMetric={renderLeaderMetric} />
        </div>
        <div className={dualRankColEnd}>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-400">
            <ArrowDownRight className="size-3.5" />
            {laggardsLabel}
          </p>
          <RankList rows={laggards} renderPrimary={renderPrimary} renderMetric={renderLaggardMetric} />
        </div>
      </CardContent>
    </Card>
  );
}

function MixPie({ title, rows, nameKey, valueKey }: { title: string; rows: RankRow[]; nameKey: string; valueKey: string }) {
  const data = useMemo(() => {
    const sorted = [...rows].sort((a, b) => Number(b[valueKey] ?? 0) - Number(a[valueKey] ?? 0));
    const top = sorted.slice(0, 5);
    const rest = sorted.slice(5).reduce((s, r) => s + Number(r[valueKey] ?? 0), 0);
    const chart = top.map((r) => ({
      name: String(r[nameKey] ?? "—"),
      value: Number(r[valueKey] ?? 0),
    }));
    if (rest > 0) chart.push({ name: "Other", value: rest });
    return chart;
  }, [rows, nameKey, valueKey]);

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No sales mix in this period.</p>
        ) : (
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={80} paddingAngle={2}>
                  {data.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatCurrencyAmount(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function PerformanceReport({ report }: { report: ReportDefinition }) {
  const filters = useBusinessReportFilters(report);
  const { loading, isFetching, error, rawData, reload } = useErpReportFetch(report, {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    asOf: filters.asOf,
    storeId: filters.storeId,
    channel: filters.channel,
    accountId: "",
    search: filters.debouncedSearch,
    salesmanId: filters.salesmanId,
    cityId: filters.addressCityId ?? undefined,
    streetId: filters.addressStreetId ?? undefined,
    mallId: filters.addressMallId ?? undefined,
  });

  const payload = useMemo(() => parsePayload(rawData), [rawData]);
  const q = filters.debouncedSearch;

  const kpis = payload?.kpis ?? {};
  const trend = payload?.sales_trend ?? [];

  const items = payload?.items ?? {};
  const salesmen = payload?.salesmen ?? {};
  const brands = payload?.brands ?? {};
  const categories = payload?.categories ?? {};
  const customers = payload?.customers ?? {};
  const vendors = payload?.vendors ?? {};

  const filtered = useMemo(
    () => ({
      topItemsSales: filterRows(asRows(items.top_by_sales), q, ["product_name"]),
      bottomItemsSales: filterRows(asRows(items.bottom_by_sales), q, ["product_name"]),
      topItemsQty: filterRows(asRows(items.top_by_qty), q, ["product_name"]),
      topItemsRoi: filterRows(asRows(items.top_by_profit_percent), q, ["product_name"]),
      bottomItemsRoi: filterRows(asRows(items.bottom_by_profit_percent), q, ["product_name"]),
      topSalesmen: filterRows(asRows(salesmen.top_by_sales), q, ["salesman_name"]),
      bottomSalesmen: filterRows(asRows(salesmen.bottom_by_sales), q, ["salesman_name"]),
      topCollections: filterRows(asRows(salesmen.top_by_collections), q, ["salesman_name"]),
      bottomCollectionRate: filterRows(asRows(salesmen.bottom_by_collection_rate), q, ["salesman_name"]),
      brandMix: filterRows(asRows(brands.mix), q, ["brand_name"]),
      topBrands: filterRows(asRows(brands.top_by_sales), q, ["brand_name"]),
      bottomBrands: filterRows(asRows(brands.bottom_by_sales), q, ["brand_name"]),
      categoryMix: filterRows(asRows(categories.mix), q, ["category_name"]),
      topCategories: filterRows(asRows(categories.top_by_sales), q, ["category_name"]),
      bottomCategories: filterRows(asRows(categories.bottom_by_sales), q, ["category_name"]),
      topCustomers: filterRows(asRows(customers.top_by_sales), q, ["customer_name"]),
      bottomCustomers: filterRows(asRows(customers.bottom_by_sales), q, ["customer_name"]),
      topCustomerAr: filterRows(asRows(customers.top_by_ar), q, ["customer_name"]),
      fastestCustomers: filterRows(asRows(customers.fastest_payers), q, ["customer_name"]),
      slowestCustomers: filterRows(asRows(customers.slowest_payers), q, ["customer_name"]),
      topVendors: filterRows(asRows(vendors.top_by_purchases), q, ["vendor_name"]),
      bottomVendors: filterRows(asRows(vendors.bottom_by_purchases), q, ["vendor_name"]),
      topVendorAp: filterRows(asRows(vendors.top_by_ap), q, ["vendor_name"]),
      fastestVendors: filterRows(asRows(vendors.fastest_payers), q, ["vendor_name"]),
      slowestVendors: filterRows(asRows(vendors.slowest_payers), q, ["vendor_name"]),
    }),
    [items, salesmen, brands, categories, customers, vendors, q],
  );

  const exportSource = buildReportExportSource({
    slug: report.slug,
    title: report.title,
    columns: [
      { key: "section", label: "Section" },
      { key: "rank", label: "Rank" },
      { key: "name", label: "Name" },
      { key: "metric", label: "Metric" },
    ],
    getRows: () => {
      const flat: Record<string, unknown>[] = [];
      const push = (section: string, rows: RankRow[], nameKey: string, metricKey: string) => {
        rows.forEach((row, i) => {
          flat.push({
            section,
            rank: i + 1,
            name: row[nameKey],
            metric: row[metricKey],
          });
        });
      };
      push("Top items by sales", filtered.topItemsSales, "product_name", "net_sales_ex_tax");
      push("Top salesmen", filtered.topSalesmen, "salesman_name", "total_sales");
      push("Top customers", filtered.topCustomers, "customer_name", "total_sales");
      return flat;
    },
    getSubtitle: () => formatReportPeriodRange(filters.dateFrom, filters.dateTo),
  });

  const kpiStrip = (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4">
      <KpiLinkCard
        label="Net sales (ex tax)"
        value={formatCurrencyAmount(Number(kpis.net_sales_ex_tax ?? 0))}
        href="/admin/erp/reports/sales-by-item"
        hint="Sales by item"
      />
      <KpiLinkCard
        label="Recognized profit"
        value={formatCurrencyAmount(Number(kpis.recognized_profit ?? 0))}
        href="/admin/erp/reports/sales-by-customer"
        hint="Recognized margin · not GL P&L"
      />
      <KpiLinkCard
        label="Collections"
        value={formatCurrencyAmount(Number(kpis.collections ?? 0))}
        href="/admin/erp/reports/payments-received"
        hint={`${Number(kpis.collection_rate ?? 0).toFixed(1)}% of billed sales`}
      />
      <KpiLinkCard
        label="AR outstanding"
        value={formatCurrencyAmount(Number(kpis.ar_outstanding ?? 0))}
        href="/admin/erp/reports/customer-aging"
        hint="Open customer balances"
      />
      <KpiLinkCard
        label="AP outstanding"
        value={formatCurrencyAmount(Number(kpis.ap_outstanding ?? 0))}
        href="/admin/erp/reports/vendor-aging"
        hint="Open vendor balances"
      />
      <KpiLinkCard
        label="Profit margin"
        value={`${Number(kpis.profit_percent ?? 0).toFixed(1)}%`}
        href="/admin/erp/reports/profit-and-loss"
        hint="Recognized · see P&L for GL"
      />
      <KpiLinkCard
        label="Invoices"
        value={Number(kpis.invoice_count ?? 0).toLocaleString()}
        href="/admin/erp/reports/sales-by-customer"
      />
      <KpiLinkCard
        label="Pending cost revenue"
        value={formatCurrencyAmount(Number(kpis.uncosted_revenue ?? 0))}
        href="/admin/erp/reports/sales-by-item"
        hint="Excluded from margin %"
      />
    </div>
  );

  const hasActivity = Number(kpis.invoice_count ?? 0) > 0 || trend.some((t) => t.sales > 0 || t.collections > 0);

  return (
    <BusinessReportLayout
      report={report}
      filters={filters}
      loading={loading}
      fetching={isFetching}
      isEmpty={!loading && !error && !hasActivity}
      emptyMessage="No sales or collections in this period for the selected store and filters."
      onRefresh={reload}
      exportSource={exportSource}
      showDateRange
      searchPlaceholder="Filter rankings by name…"
      error={error}
      metrics={!loading && hasActivity ? kpiStrip : null}
    >
      {loading && !payload ? (
        <AdminDetailBodySkeleton />
      ) : (
        <div className="space-y-6 p-1 sm:p-2">
          <div className="rounded-lg border border-border/80 bg-muted/30 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
            <strong className="font-semibold text-foreground">Accuracy note:</strong> Rankings use
            recognized invoice margin (sale-time cost / WAC), not posted GL. Salesman collections
            follow payment allocations to invoices; unallocated bulk receipts are not split across
            salespeople. Customer and vendor pay-speed averages use fully settled documents with
            payments in this period.
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-sm font-semibold">Sales vs collections</CardTitle>
                  <p className="text-xs text-muted-foreground">Daily totals in selected period</p>
                </div>
                <BarChart3 className="size-5 text-muted-foreground" aria-hidden />
              </CardHeader>
              <CardContent>
                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="perfSales" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={CHART_SALES} stopOpacity={0.35} />
                          <stop offset="95%" stopColor={CHART_SALES} stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="perfColl" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={CHART_COLLECTIONS} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={CHART_COLLECTIONS} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                      <XAxis dataKey="bucket" tick={{ fontSize: 10 }} tickFormatter={(v) => String(v).slice(5)} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrencyAmount(Number(v))} width={72} />
                      <Tooltip formatter={(v) => formatCurrencyAmount(Number(v))} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Area type="monotone" dataKey="sales" name="Sales" stroke={CHART_SALES} fill="url(#perfSales)" strokeWidth={2} />
                      <Area type="monotone" dataKey="collections" name="Collections" stroke={CHART_COLLECTIONS} fill="url(#perfColl)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <div className="grid gap-4">
              <MixPie title="Sales by brand" rows={filtered.brandMix} nameKey="brand_name" valueKey="net_sales_ex_tax" />
              <MixPie title="Sales by category" rows={filtered.categoryMix} nameKey="category_name" valueKey="net_sales_ex_tax" />
            </div>
          </div>

          <DualRankCard
            title="Items"
            icon={Package}
            leaders={filtered.topItemsSales}
            laggards={filtered.bottomItemsSales}
            leadersLabel="Highest sales"
            laggardsLabel="Lowest sales (active)"
            footerLink={{ href: "/admin/erp/reports/sales-by-item", label: "Sales by item" }}
            renderPrimary={(row) => {
              const id = String(row.product_id ?? "");
              return (
                <div className="flex items-center gap-3">
                  <ProductThumb url={row.image_url as string} name={String(row.product_name ?? "")} />
                  <div className="min-w-0">
                    {id ? (
                      <Link href={`/admin/products/${id}`} className="block truncate font-medium text-primary hover:underline">
                        {String(row.product_name ?? "—")}
                      </Link>
                    ) : (
                      <p className="truncate font-medium">{String(row.product_name ?? "—")}</p>
                    )}
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {Number(row.qty ?? 0).toLocaleString()} sold · {Number(row.qty_per_day ?? 0).toFixed(2)}/day
                    </p>
                  </div>
                </div>
              );
            }}
            renderLeaderMetric={(row) => formatCurrencyAmount(Number(row.net_sales_ex_tax ?? 0))}
            renderLaggardMetric={(row) => formatCurrencyAmount(Number(row.net_sales_ex_tax ?? 0))}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="border-b bg-muted/20 pb-3">
                <CardTitle className="text-base">Fast movers &amp; margin</CardTitle>
              </CardHeader>
              <CardContent className={splitTwoGrid}>
                <div className={splitTwoColStart}>
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">By quantity</p>
                  <RankList
                    rows={filtered.topItemsQty.slice(0, 5)}
                    renderPrimary={(row) => (
                      <Link href={`/admin/products/${row.product_id}`} className="truncate text-sm font-medium text-primary hover:underline">
                        {String(row.product_name ?? "—")}
                      </Link>
                    )}
                    renderMetric={(row) => Number(row.qty ?? 0).toLocaleString()}
                  />
                </div>
                <div className={splitTwoColEnd}>
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">ROI (profit / COGS)</p>
                  <RankList
                    rows={filtered.topItemsRoi.slice(0, 5)}
                    renderPrimary={(row) => String(row.product_name ?? "—")}
                    renderMetric={(row) => `${Number(row.profit_percent ?? 0).toFixed(1)}%`}
                  />
                  <p className="mt-3 text-xs font-semibold uppercase text-muted-foreground">Lowest margin</p>
                  <RankList
                    rows={filtered.bottomItemsRoi.slice(0, 5)}
                    renderPrimary={(row) => String(row.product_name ?? "—")}
                    renderMetric={(row) => `${Number(row.profit_percent ?? 0).toFixed(1)}%`}
                  />
                </div>
              </CardContent>
            </Card>

            <DualRankCard
              title="Salespeople"
              icon={Users}
              leaders={filtered.topSalesmen}
              laggards={filtered.bottomSalesmen}
              leadersLabel="Highest sales"
              laggardsLabel="Lowest sales"
              footerLink={{ href: "/admin/erp/reports/sales-by-salesman", label: "Sales by salesman" }}
              renderPrimary={(row) => {
                const id = String(row.salesman_id ?? "");
                const unassigned = id === "00000000-0000-0000-0000-000000000000" || !id;
                return unassigned ? (
                  <span>{String(row.salesman_name ?? "Unassigned")}</span>
                ) : (
                  <Link href={`/admin/erp/employees/${id}`} className="font-medium text-primary hover:underline">
                    {String(row.salesman_name ?? "—")}
                  </Link>
                );
              }}
              renderLeaderMetric={(row) => formatCurrencyAmount(Number(row.total_sales ?? 0))}
              renderLaggardMetric={(row) => formatCurrencyAmount(Number(row.total_sales ?? 0))}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20 pb-3">
                <CardTitle className="text-base">Collections by salespeople</CardTitle>
                <Link href="/admin/erp/reports/payments-received" className="text-xs text-primary hover:underline">
                  Payments received
                </Link>
              </CardHeader>
              <CardContent className={splitTwoGrid}>
                <div className={splitTwoColStart}>
                  <p className="mb-2 text-xs font-semibold uppercase text-emerald-700">Top collections</p>
                  <RankList
                    rows={filtered.topCollections.slice(0, 6)}
                    renderPrimary={(row) => String(row.salesman_name ?? "—")}
                    renderMetric={(row) => formatCurrencyAmount(Number(row.collections ?? 0))}
                  />
                </div>
                <div className={splitTwoColEnd}>
                  <p className="mb-2 text-xs font-semibold uppercase text-amber-800">Lowest collection rate</p>
                  <RankList
                    rows={filtered.bottomCollectionRate.slice(0, 6)}
                    renderPrimary={(row) => String(row.salesman_name ?? "—")}
                    renderMetric={(row) => `${Number(row.collection_rate ?? 0).toFixed(1)}%`}
                  />
                </div>
              </CardContent>
            </Card>

            <DualRankCard
              title="Brands"
              icon={TrendingUp}
              leaders={filtered.topBrands}
              laggards={filtered.bottomBrands}
              leadersLabel="Top brands"
              laggardsLabel="Smallest share"
              renderPrimary={(row) => (
                <div className="flex items-center gap-2">
                  <ProductThumb url={(row.image_url as string) ?? null} name={String(row.brand_name ?? "")} />
                  <span className="truncate font-medium">{String(row.brand_name ?? "—")}</span>
                </div>
              )}
              renderLeaderMetric={(row) => formatCurrencyAmount(Number(row.net_sales_ex_tax ?? 0))}
              renderLaggardMetric={(row) => formatCurrencyAmount(Number(row.net_sales_ex_tax ?? 0))}
            />
          </div>

          <DualRankCard
            title="Customers"
            icon={Wallet}
            leaders={filtered.topCustomers}
            laggards={filtered.bottomCustomers}
            leadersLabel="Highest sales"
            laggardsLabel="Lowest sales (active)"
            footerLink={{ href: "/admin/erp/reports/sales-by-customer", label: "Sales by customer" }}
            renderPrimary={(row) => (
              <Link href={`/admin/customers/${row.user_id}`} className="font-medium text-primary hover:underline">
                {String(row.customer_name ?? "—")}
              </Link>
            )}
            renderLeaderMetric={(row) => formatCurrencyAmount(Number(row.total_sales ?? 0))}
            renderLaggardMetric={(row) => formatCurrencyAmount(Number(row.total_sales ?? 0))}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="border-b bg-muted/20 pb-3">
                <CardTitle className="text-base">Receivables &amp; pay speed</CardTitle>
              </CardHeader>
              <CardContent className={splitTwoGrid}>
                <div className={splitTwoColStart}>
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Highest AR</p>
                  <RankList
                    rows={filtered.topCustomerAr.slice(0, 6)}
                    renderPrimary={(row) => (
                      <Link href={`/admin/customers/${row.user_id}`} className="text-sm text-primary hover:underline">
                        {String(row.customer_name ?? "—")}
                      </Link>
                    )}
                    renderMetric={(row) => formatCurrencyAmount(Number(row.balance_due ?? 0))}
                  />
                </div>
                <div className={splitTwoColEnd}>
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Pay speed (days)</p>
                  <RankList
                    rows={filtered.fastestCustomers.slice(0, 4)}
                    renderPrimary={(row) => String(row.customer_name ?? "—")}
                    renderMetric={(row) => `${Math.round(Number(row.avg_days_to_pay ?? 0))}d fast`}
                  />
                  <RankList
                    rows={filtered.slowestCustomers.slice(0, 4)}
                    renderPrimary={(row) => String(row.customer_name ?? "—")}
                    renderMetric={(row) => `${Math.round(Number(row.avg_days_to_pay ?? 0))}d slow`}
                  />
                </div>
              </CardContent>
            </Card>

            <DualRankCard
              title="Vendors"
              icon={Building2}
              leaders={filtered.topVendors}
              laggards={filtered.bottomVendors}
              leadersLabel="Highest purchases"
              laggardsLabel="Lowest purchases"
              footerLink={{ href: "/admin/erp/reports/purchase-by-vendor", label: "Purchase by vendor" }}
              renderPrimary={(row) => (
                <Link href={`/admin/vendors/${row.vendor_id}`} className="font-medium text-primary hover:underline">
                  {String(row.vendor_name ?? "—")}
                </Link>
              )}
              renderLeaderMetric={(row) => formatCurrencyAmount(Number(row.purchase_total ?? 0))}
              renderLaggardMetric={(row) => formatCurrencyAmount(Number(row.purchase_total ?? 0))}
            />
          </div>

          <Card>
            <CardHeader className="border-b bg-muted/20 pb-3">
              <CardTitle className="text-base">Vendor payables &amp; settlement</CardTitle>
            </CardHeader>
            <CardContent className={splitThreeGrid}>
              <div className={splitThreeCol}>
                <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Highest AP</p>
                <RankList
                  rows={filtered.topVendorAp.slice(0, 5)}
                  renderPrimary={(row) => (
                    <Link href={`/admin/vendors/${row.vendor_id}`} className="text-sm text-primary hover:underline">
                      {String(row.vendor_name ?? "—")}
                    </Link>
                  )}
                  renderMetric={(row) => formatCurrencyAmount(Number(row.balance_due ?? 0))}
                />
              </div>
              <div className={splitThreeCol}>
                <p className="mb-2 text-xs font-semibold uppercase text-emerald-700">Fastest payers</p>
                <RankList
                  rows={filtered.fastestVendors.slice(0, 5)}
                  renderPrimary={(row) => String(row.vendor_name ?? "—")}
                  renderMetric={(row) => `${Math.round(Number(row.avg_days_to_pay ?? 0))} days`}
                />
              </div>
              <div className={splitThreeCol}>
                <p className="mb-2 text-xs font-semibold uppercase text-amber-800">Slowest payers</p>
                <RankList
                  rows={filtered.slowestVendors.slice(0, 5)}
                  renderPrimary={(row) => String(row.vendor_name ?? "—")}
                  renderMetric={(row) => `${Math.round(Number(row.avg_days_to_pay ?? 0))} days`}
                />
              </div>
            </CardContent>
          </Card>

          <DualRankCard
            title="Categories"
            icon={BarChart3}
            leaders={filtered.topCategories}
            laggards={filtered.bottomCategories}
            leadersLabel="Top categories"
            laggardsLabel="Smallest share"
            renderPrimary={(row) => String(row.category_name ?? "—")}
            renderLeaderMetric={(row) => formatCurrencyAmount(Number(row.net_sales_ex_tax ?? 0))}
            renderLaggardMetric={(row) => formatCurrencyAmount(Number(row.net_sales_ex_tax ?? 0))}
          />
        </div>
      )}
    </BusinessReportLayout>
  );
}
