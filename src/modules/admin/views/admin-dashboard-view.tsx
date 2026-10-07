"use client";

import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  ChevronRight,
  FileText,
  Package,
  Receipt,
  ShoppingCart,
  Store,
  Truck,
  Wallet,
} from "lucide-react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
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

import type {
  AdminDashboardPayload,
  DashboardAlert,
  DashboardChartGranularity,
  DashboardErpInvoiceRow,
  DashboardMonthlySeriesPoint,
  Order,
} from "@/common/admin/types";
import type { AuditLogEntry } from "@/common/erp/types";
import { formatAuditLogUserDetail } from "@/modules/erp/lib/audit-log-display";
import type { ErpFinancialDashboard } from "@/common/erp/finance-types";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { StatusBadge } from "@/modules/admin/components/status-badge";
import { CurrencyAmount } from "@/components/currency-amount";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  formatCurrencyAmount,
  formatCurrencyCompactAmount,
} from "@/lib/format-currency";
import { useCurrencySettings } from "@/modules/settings/providers/currency-settings-provider";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import { AdminPageHeader, AdminPageLayout } from "@/modules/admin/ui";
import { useActiveStoreScope } from "@/modules/erp/components/use-active-store-scope";
import { inventoryFulfillmentLabel } from "@/modules/orders/components/orders-ui";
import { cn } from "@/lib/utils";

const CHART_INCOME = "hsl(var(--primary))";
const CHART_EXPENSE = "#f59e0b";
const CHART_PROFIT = "#22c55e";
const CHART_LOSS = "#ef4444";

const INVOICE_STATUS_COLORS: Record<string, string> = {
  draft: "#94a3b8",
  issued: "hsl(var(--primary))",
  partial: "#f59e0b",
  paid: "#22c55e",
  cancelled: "#ef4444",
  void: "#64748b",
};

function defaultDashboardDates() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    dateFrom: `${today.slice(0, 4)}-01-01`,
    dateTo: today,
  };
}

function DashboardDateFilters({
  dateFrom,
  dateTo,
  granularity,
  onDateFromChange,
  onDateToChange,
  onGranularityChange,
}: {
  dateFrom: string;
  dateTo: string;
  granularity: DashboardChartGranularity;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onGranularityChange: (value: DashboardChartGranularity) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);

  function applyPreset(preset: "ytd" | "month" | "last30") {
    if (preset === "ytd") {
      const defaults = defaultDashboardDates();
      onDateFromChange(defaults.dateFrom);
      onDateToChange(defaults.dateTo);
      onGranularityChange("month");
      return;
    }
    if (preset === "month") {
      onDateFromChange(`${today.slice(0, 8)}01`);
      onDateToChange(today);
      onGranularityChange("day");
      return;
    }
    const start = new Date();
    start.setDate(start.getDate() - 29);
    onDateFromChange(start.toISOString().slice(0, 10));
    onDateToChange(today);
    onGranularityChange("day");
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-3 px-4 py-3">
        <div className="space-y-1">
          <Label htmlFor="dashboard-date-from">From</Label>
          <Input
            id="dashboard-date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
            className="h-9 w-[150px]"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="dashboard-date-to">To</Label>
          <Input
            id="dashboard-date-to"
            type="date"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
            className="h-9 w-[150px]"
          />
        </div>
        <div className="space-y-1">
          <Label>Group by</Label>
          <div className="flex h-9 rounded-md border border-input p-0.5">
            <Button
              type="button"
              variant={granularity === "day" ? "secondary" : "ghost"}
              size="sm"
              className="h-full px-3"
              onClick={() => onGranularityChange("day")}
            >
              Days
            </Button>
            <Button
              type="button"
              variant={granularity === "month" ? "secondary" : "ghost"}
              size="sm"
              className="h-full px-3"
              onClick={() => onGranularityChange("month")}
            >
              Months
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 pb-0.5">
          <Button type="button" variant="outline" size="sm" onClick={() => applyPreset("ytd")}>
            YTD
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => applyPreset("month")}>
            This month
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => applyPreset("last30")}>
            Last 30 days
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function chartXAxisProps(pointCount: number) {
  const dense = pointCount > 14;
  return {
    tick: { fontSize: dense ? 9 : 11 },
    angle: dense ? -45 : 0,
    textAnchor: dense ? ("end" as const) : ("middle" as const),
    height: dense ? 56 : 30,
    interval: pointCount > 31 ? Math.max(0, Math.floor(pointCount / 18)) : 0,
  };
}

function fmtMoney(n: number, settings: ReturnType<typeof useCurrencySettings>["settings"]) {
  return formatCurrencyCompactAmount(n, settings);
}

function ChartMoneyTooltip({
  active,
  payload,
  label,
  settings,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string }[];
  label?: string;
  settings: ReturnType<typeof useCurrencySettings>["settings"];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="tabular-nums text-muted-foreground">
          <span
            className="mr-1.5 inline-block size-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          {entry.name}: {formatCurrencyAmount(Number(entry.value ?? 0), undefined, settings)}
        </p>
      ))}
    </div>
  );
}

function DashboardMetricCard({
  label,
  value,
  href,
  icon: Icon,
  negative,
  subtext,
}: {
  label: string;
  value: string;
  href?: string;
  icon: typeof Wallet;
  negative?: boolean;
  subtext?: string;
}) {
  const content = (
    <Card className="overflow-hidden border border-border py-0 ring-0 transition-colors hover:border-primary/30">
      <CardContent className="flex items-start gap-3 px-4 py-3.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p
            className={cn(
              "mt-0.5 text-xl font-semibold tabular-nums tracking-tight",
              negative ? "text-rose-600" : "text-foreground",
            )}
          >
            {value}
          </p>
          {subtext ? <p className="mt-0.5 text-[11px] text-muted-foreground">{subtext}</p> : null}
        </div>
      </CardContent>
    </Card>
  );

  if (!href) return content;
  return <Link href={href}>{content}</Link>;
}

function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

function AlertStrip({ alerts }: { alerts: DashboardAlert[] }) {
  const visible = alerts.filter((a) => a.count > 0);
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {visible.map((alert) => (
        <Link
          key={alert.id}
          href={alert.href}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition hover:bg-muted",
            alert.severity === "critical" && "border-rose-200 bg-rose-50 text-rose-800",
            alert.severity === "warning" && "border-amber-200 bg-amber-50 text-amber-900",
            alert.severity === "attention" && "border-sky-200 bg-sky-50 text-sky-900",
          )}
        >
          <AlertTriangle className="size-3.5 shrink-0" />
          {alert.count.toLocaleString()} {alert.label}
          <ChevronRight className="size-3.5 opacity-60" />
        </Link>
      ))}
    </div>
  );
}

function IncomeExpensesChart({
  series,
  erp,
  settings,
  granularity,
}: {
  series: DashboardMonthlySeriesPoint[];
  erp: ErpFinancialDashboard | null;
  settings: ReturnType<typeof useCurrencySettings>["settings"];
  granularity: DashboardChartGranularity;
}) {
  const xAxis = chartXAxisProps(series.length);
  const periodLabel = granularity === "day" ? "day" : "month";

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Income vs expenses</CardTitle>
        <p className="text-xs text-muted-foreground">
          Posted journal entries by {periodLabel} (matches Profit &amp; Loss)
        </p>
      </CardHeader>
      <CardContent>
        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: xAxis.height - 24 }}>
              <defs>
                <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_INCOME} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={CHART_INCOME} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_EXPENSE} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={CHART_EXPENSE} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
              <XAxis dataKey="month" {...xAxis} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => formatCurrencyCompactAmount(Number(v), settings)}
              />
              <Tooltip content={<ChartMoneyTooltip settings={settings} />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area
                type="monotone"
                dataKey="income"
                name="Income"
                stroke={CHART_INCOME}
                fill="url(#incomeFill)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="expenses"
                name="Expenses"
                stroke={CHART_EXPENSE}
                fill="url(#expenseFill)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 text-center">
          <Link href="/admin/erp/reports/profit-and-loss" className="hover:underline">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Total income
            </p>
            <p className="text-base font-semibold tabular-nums text-primary">
              {fmtMoney(erp?.net_income_ytd ?? 0, settings)}
            </p>
          </Link>
          <Link href="/admin/erp/reports/profit-and-loss" className="hover:underline">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Total expenses
            </p>
            <p className="text-base font-semibold tabular-nums">
              {fmtMoney(erp?.expenses_ytd ?? 0, settings)}
            </p>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function InvoiceStatusDonut({
  data,
  settings,
}: {
  data: ErpFinancialDashboard["invoice_status_ytd"] | undefined;
  settings: ReturnType<typeof useCurrencySettings>["settings"];
}) {
  const rows = (data ?? []).map((row) => ({
    name: row.status.charAt(0).toUpperCase() + row.status.slice(1),
    status: row.status,
    count: row.count,
    total: row.total,
  }));
  const totalCount = rows.reduce((s, r) => s + r.count, 0);

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Invoices in period</CardTitle>
        <p className="text-xs text-muted-foreground">Branch invoice status for selected dates</p>
      </CardHeader>
      <CardContent>
        <div className="h-[180px] w-full">
          {rows.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No invoices yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={rows}
                  dataKey="count"
                  nameKey="name"
                  innerRadius={48}
                  outerRadius={72}
                  paddingAngle={2}
                >
                  {rows.map((row) => (
                    <Cell
                      key={row.status}
                      fill={INVOICE_STATUS_COLORS[row.status] ?? "#94a3b8"}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, _name, item) => {
                    const row = item.payload as { total: number; count: number };
                    return [
                      `${value} invoices · ${formatCurrencyAmount(row.total, undefined, settings)}`,
                      item.name,
                    ];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
        <Link
          href="/admin/erp/invoices"
          className="mt-2 flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm hover:bg-muted"
        >
          <span>{totalCount.toLocaleString()} invoices in period</span>
          <ChevronRight className="size-4 text-muted-foreground" />
        </Link>
      </CardContent>
    </Card>
  );
}

function NetProfitChart({
  series,
  settings,
  granularity,
}: {
  series: DashboardMonthlySeriesPoint[];
  settings: ReturnType<typeof useCurrencySettings>["settings"];
  granularity: DashboardChartGranularity;
}) {
  const chartData = series.map((row) => ({
    ...row,
    fill: row.netProfit >= 0 ? CHART_PROFIT : CHART_LOSS,
  }));
  const xAxis = chartXAxisProps(series.length);
  const periodLabel = granularity === "day" ? "day" : "month";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-sm font-semibold">Net profit / loss</CardTitle>
          <p className="text-xs text-muted-foreground">By {periodLabel} from posted journals</p>
        </div>
        <Link
          href="/admin/erp/reports/profit-and-loss"
          className="text-xs text-primary hover:underline"
        >
          Full P&amp;L
        </Link>
      </CardHeader>
      <CardContent>
        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: xAxis.height - 24 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
              <XAxis dataKey="month" {...xAxis} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => formatCurrencyCompactAmount(Number(v), settings)}
              />
              <Tooltip content={<ChartMoneyTooltip settings={settings} />} />
              <Bar dataKey="netProfit" name="Net profit" radius={[4, 4, 0, 0]}>
                {chartData.map((row) => (
                  <Cell key={row.month} fill={row.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function RecentInvoicesPanel({ invoices }: { invoices: DashboardErpInvoiceRow[] }) {
  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-sm font-semibold">Recent invoices</CardTitle>
          <p className="text-xs text-muted-foreground">Latest branch sales</p>
        </div>
        <Link href="/admin/erp/invoices" className="text-xs text-primary hover:underline">
          All invoices
        </Link>
      </CardHeader>
      <CardContent>
        <ul className="max-h-[280px] space-y-1 overflow-y-auto">
          {invoices.length === 0 ? (
            <li className="py-6 text-center text-sm text-muted-foreground">No recent invoices</li>
          ) : (
            invoices.map((inv) => (
              <li key={inv.id}>
                <Link
                  href={`/admin/erp/invoices/${inv.id}`}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-2 hover:bg-muted"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {inv.customer_name ?? "Walk-in customer"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {inv.invoice_number} · {format(new Date(inv.created_at), "dd MMM, h:mm a")}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    <CurrencyAmount amount={inv.total_amount} compact />
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>
      </CardContent>
    </Card>
  );
}

function ActivityLogPanel({ entries }: { entries: AuditLogEntry[] }) {
  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-sm font-semibold">Recent activity</CardTitle>
          <p className="text-xs text-muted-foreground">Branch ERP actions</p>
        </div>
        <Link
          href="/admin/erp/reports/activity-logs"
          className="text-xs text-primary hover:underline"
        >
          All logs
        </Link>
      </CardHeader>
      <CardContent>
        <ul className="max-h-[280px] space-y-0 overflow-y-auto">
          {entries.length === 0 ? (
            <li className="py-8 text-center text-sm text-muted-foreground">No activity yet</li>
          ) : (
            entries.map((entry) => (
              <li key={entry.id} className="border-l-2 border-primary/20 py-2 pl-3 first:pt-0">
                <p className="text-sm font-medium capitalize">
                  {entry.action.replace(/_/g, " ")}
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    · {entry.entity_type.replace(/_/g, " ")}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(entry.created_at), "dd MMM yyyy, h:mm a")}
                  {" · "}
                  By {formatAuditLogUserDetail(entry)}
                </p>
              </li>
            ))
          )}
        </ul>
      </CardContent>
    </Card>
  );
}

function FulfillmentPanel({
  counts,
  pipeline,
}: {
  counts: AdminDashboardPayload["fulfillmentCounts"];
  pipeline: AdminDashboardPayload["pipeline"];
}) {
  const stages = [
    {
      label: "Needs store",
      count: counts.needsAssignment,
      href: "/admin/erp/fulfillment-queue?filter=needs_assignment",
      icon: Package,
    },
    {
      label: "Ready to ship",
      count: counts.readyToShip,
      href: "/admin/erp/fulfillment-queue?filter=ready_to_ship",
      icon: Boxes,
    },
    {
      label: "In transit",
      count: counts.shipped,
      href: "/admin/orders?status=shipped",
      icon: Truck,
    },
    {
      label: "Delivered",
      count: counts.delivered,
      href: "/admin/orders?status=delivered",
      icon: ShoppingCart,
    },
  ];

  const onlineOpen = pipeline.pending + pipeline.processing + pipeline.shipped;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-sm font-semibold">Fulfillment &amp; online pipeline</CardTitle>
          <p className="text-xs text-muted-foreground">
            {onlineOpen.toLocaleString()} online orders in progress
          </p>
        </div>
        <Link
          href="/admin/erp/fulfillment-queue"
          className="text-xs text-primary hover:underline"
        >
          Fulfillment queue
        </Link>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {stages.map((stage) => (
            <Link
              key={stage.label}
              href={stage.href}
              className="flex items-center gap-3 rounded-lg border px-3 py-3 transition hover:border-primary/30 hover:bg-muted/50"
            >
              <span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <stage.icon className="size-4" />
              </span>
              <div>
                <p className="text-xs text-muted-foreground">{stage.label}</p>
                <p className="text-lg font-semibold tabular-nums">{stage.count}</p>
              </div>
            </Link>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-4 gap-1">
          {[
            { key: "pending", label: "Pending", count: pipeline.pending, color: "bg-amber-400" },
            {
              key: "processing",
              label: "Processing",
              count: pipeline.processing,
              color: "bg-sky-400",
            },
            { key: "shipped", label: "Shipped", count: pipeline.shipped, color: "bg-violet-400" },
            {
              key: "delivered",
              label: "Delivered",
              count: pipeline.delivered,
              color: "bg-emerald-400",
            },
          ].map((s) => {
            const total =
              pipeline.pending + pipeline.processing + pipeline.shipped + pipeline.delivered || 1;
            const pct = Math.max(8, (s.count / total) * 100);
            return (
              <Link
                key={s.key}
                href={`/admin/orders?status=${s.key}`}
                className="group text-center"
              >
                <div className="flex h-16 items-end overflow-hidden rounded-md bg-muted">
                  <div className={`w-full rounded-t-md ${s.color}`} style={{ height: `${pct}%` }} />
                </div>
                <p className="mt-1 text-[10px] font-medium text-muted-foreground group-hover:text-primary">
                  {s.label}
                </p>
                <p className="text-xs font-semibold tabular-nums">{s.count}</p>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function OrderTimelinePanel({ orders }: { orders: Order[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-sm font-semibold">Online order timeline</CardTitle>
          <p className="text-xs text-muted-foreground">Latest storefront orders</p>
        </div>
        <Link href="/admin/orders" className="text-xs text-primary hover:underline">
          All orders
        </Link>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1">
          {orders.length === 0 ? (
            <li className="py-6 text-center text-sm text-muted-foreground">No orders yet</li>
          ) : (
            orders.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/admin/orders/${order.id}`}
                  className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium">
                        {order.users?.name ?? order.users?.phone ?? "Guest"}
                      </p>
                      <StatusBadge status={order.status} />
                      {order.fulfillment_status ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {inventoryFulfillmentLabel(order.fulfillment_status)}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {order.created_at
                        ? formatDistanceToNow(new Date(order.created_at), { addSuffix: true })
                        : "—"}
                      {order.source ? ` · ${order.source}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {order.total_amount != null ? (
                      <CurrencyAmount amount={order.total_amount} compact />
                    ) : (
                      "—"
                    )}
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>
      </CardContent>
    </Card>
  );
}

function InventoryPanel({
  alerts,
  inventory,
  lowStockCount,
}: {
  alerts: DashboardAlert[];
  inventory: AdminDashboardPayload["inventory"];
  lowStockCount: number;
}) {
  const stockAlerts = alerts.filter((a) => ["out-of-stock", "low-stock"].includes(a.id));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-sm font-semibold">Branch inventory</CardTitle>
          <p className="text-xs text-muted-foreground">Stock levels at this store</p>
        </div>
        <Link href="/admin/erp/reports/store-wise-stock" className="text-xs text-primary hover:underline">
          Stock report
        </Link>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/admin/erp/reports/item-stock"
            className="rounded-lg border px-3 py-3 hover:bg-muted"
          >
            <div className="flex items-center gap-2 text-rose-600">
              <ArrowDownLeft className="size-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Low / out of stock</span>
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{lowStockCount}</p>
          </Link>
          <Link
            href="/admin/erp/reports/store-wise-stock"
            className="rounded-lg border px-3 py-3 hover:bg-muted"
          >
            <div className="flex items-center gap-2 text-emerald-600">
              <ArrowUpRight className="size-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Units on hand</span>
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {inventory.availableInventoryUnits.toLocaleString()}
            </p>
          </Link>
          <Link
            href="/admin/inventory"
            className="rounded-lg border px-3 py-3 hover:bg-muted"
          >
            <div className="flex items-center gap-2 text-amber-600">
              <Boxes className="size-4" />
              <span className="text-xs font-medium uppercase tracking-wide">SKUs to restock</span>
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {inventory.productsNeedingRestock}
            </p>
          </Link>
          <Link
            href="/admin/orders"
            className="rounded-lg border px-3 py-3 hover:bg-muted"
          >
            <div className="flex items-center gap-2 text-sky-600">
              <FileText className="size-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Demand today</span>
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {inventory.demandTodayUnits}
            </p>
          </Link>
        </div>
        {stockAlerts.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {stockAlerts.map((alert) => (
              <Link
                key={alert.id}
                href={alert.href}
                className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-muted"
              >
                <AlertTriangle className="size-3.5 text-amber-600" />
                {alert.count} {alert.label}
              </Link>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function AdminDashboardView() {
  const { settings } = useCurrencySettings();
  const queryClient = useQueryClient();
  const { activeStoreId, storeId, erpContextLoading } = useActiveStoreScope();
  const defaults = defaultDashboardDates();
  const [dateFrom, setDateFrom] = useState(defaults.dateFrom);
  const [dateTo, setDateTo] = useState(defaults.dateTo);
  const [granularity, setGranularity] = useState<DashboardChartGranularity>("month");

  const dashboardEnabled =
    !erpContextLoading && Boolean(storeId || activeStoreId) && Boolean(dateFrom && dateTo);

  const {
    data: coreData,
    isError,
    error,
    isPending,
    isFetching: coreFetching,
    isSuccess: coreReady,
  } = useQuery({
    queryKey: adminQueryKeys.dashboard(storeId, dateFrom, dateTo, granularity, "core"),
    queryFn: () => {
      const q = new URLSearchParams();
      if (storeId) q.set("storeId", storeId);
      q.set("dateFrom", dateFrom);
      q.set("dateTo", dateTo);
      q.set("granularity", granularity);
      q.set("section", "core");
      return adminGet<AdminDashboardPayload>(`dashboard?${q.toString()}`);
    },
    placeholderData: keepPreviousData,
    enabled: dashboardEnabled,
  });

  const { data: extendedData, isFetching: extendedFetching } = useQuery({
    queryKey: adminQueryKeys.dashboard(storeId, dateFrom, dateTo, granularity, "extended"),
    queryFn: () => {
      const q = new URLSearchParams();
      if (storeId) q.set("storeId", storeId);
      q.set("dateFrom", dateFrom);
      q.set("dateTo", dateTo);
      q.set("granularity", granularity);
      q.set("section", "extended");
      return adminGet<AdminDashboardPayload>(`dashboard?${q.toString()}`);
    },
    placeholderData: keepPreviousData,
    enabled: dashboardEnabled && coreReady,
  });
  const data = coreData
    ? {
        ...coreData,
        erpFinancial: extendedData?.erpFinancial ?? coreData.erpFinancial,
        erpActivity: extendedData?.erpActivity?.length
          ? extendedData.erpActivity
          : coreData.erpActivity,
        erpMonthlySeries: extendedData?.erpMonthlySeries ?? coreData.erpMonthlySeries,
        recentErpInvoices: extendedData?.recentErpInvoices?.length
          ? extendedData.recentErpInvoices
          : coreData.recentErpInvoices,
      }
    : undefined;

  const isFetching = coreFetching || extendedFetching;

  useEffect(() => {
    function onStoreChanged() {
      void queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
    }
    window.addEventListener("buyhub:erp-store-changed", onStoreChanged);
    return () => window.removeEventListener("buyhub:erp-store-changed", onStoreChanged);
  }, [queryClient]);

  if (isPending && !data) {
    return <AdminPageSkeleton />;
  }

  if (isError) {
    return (
      <AdminPageLayout>
        <div className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4">
          <AlertTriangle className="size-5 shrink-0 text-rose-600" />
          <div>
            <p className="text-sm font-medium text-rose-900">Failed to load dashboard.</p>
            <p className="mt-1 text-sm text-rose-700">
              {error instanceof Error ? error.message : "Unknown error."}
            </p>
          </div>
        </div>
      </AdminPageLayout>
    );
  }

  if (!data) return <AdminPageSkeleton />;

  const {
    alerts,
    pipeline,
    business,
    inventory,
    recentOrders,
    erpFinancial,
    erpActivity,
    erpMonthlySeries,
    recentErpInvoices,
    erpInvoicesToday,
    fulfillmentCounts,
    storeName,
    periodFrom,
    periodTo,
  } = data;

  const netProfit = erpFinancial?.net_profit_ytd ?? 0;
  const salesToday = erpInvoicesToday + business.ordersToday;
  const periodLabel = `${format(new Date(`${periodFrom}T00:00:00`), "dd MMM yyyy")} – ${format(new Date(`${periodTo}T00:00:00`), "dd MMM yyyy")}`;

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title="Dashboard"
        description={`Overview for ${storeName}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1.5 font-normal">
              <Store className="size-3.5" />
              {storeName}
            </Badge>
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/admin/erp/reports" />}>
              Reports
              <ArrowRight data-icon="inline-end" className="size-3.5" />
            </Button>
          </div>
        }
      />

      <AlertStrip alerts={alerts} />

      <section className="space-y-3" aria-label="Key metrics">
        <SectionHeading title="At a glance" description="Today and selected period for this branch" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <DashboardMetricCard
            label="Sales today"
            value={String(salesToday)}
            subtext={`${erpInvoicesToday} invoices · ${business.ordersToday} online orders`}
            href="/admin/erp/invoices"
            icon={Receipt}
          />
          <DashboardMetricCard
            label="Net profit"
            value={fmtMoney(netProfit, settings)}
            subtext={periodLabel}
            href="/admin/erp/reports/profit-and-loss"
            icon={Wallet}
            negative={netProfit < 0}
          />
          <DashboardMetricCard
            label="Accounts receivable"
            value={fmtMoney(erpFinancial?.accounts_receivable ?? 0, settings)}
            subtext="Open invoice balances"
            href="/admin/erp/reports/customer-balance"
            icon={ArrowUpRight}
          />
          <DashboardMetricCard
            label="Accounts payable"
            value={fmtMoney(erpFinancial?.accounts_payable ?? 0, settings)}
            subtext="Open bill balances"
            href="/admin/erp/reports/vendor-balance"
            icon={ArrowDownLeft}
            negative={(erpFinancial?.accounts_payable ?? 0) > 0}
          />
        </div>
      </section>

      <section className="space-y-3" aria-label="Financial performance">
        <SectionHeading
          title="Financial performance"
          description={periodLabel}
          action={
            <div className="flex items-center gap-2">
              {isFetching ? (
                <span className="text-xs text-muted-foreground">Updating…</span>
              ) : null}
              <Link
                href={`/admin/erp/reports/profit-and-loss?dateFrom=${periodFrom}&dateTo=${periodTo}`}
                className="text-xs font-medium text-primary hover:underline"
              >
                Open P&amp;L
              </Link>
            </div>
          }
        />
        <DashboardDateFilters
          dateFrom={dateFrom}
          dateTo={dateTo}
          granularity={granularity}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          onGranularityChange={setGranularity}
        />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <IncomeExpensesChart
              series={erpMonthlySeries}
              erp={erpFinancial}
              settings={settings}
              granularity={granularity}
            />
          </div>
          <InvoiceStatusDonut data={erpFinancial?.invoice_status_ytd} settings={settings} />
        </div>
        <NetProfitChart series={erpMonthlySeries} settings={settings} granularity={granularity} />
      </section>

      <section className="space-y-3" aria-label="Online operations">
        <SectionHeading title="Online operations" description="Fulfillment pipeline and order timeline" />
        <div className="grid gap-4 lg:grid-cols-2">
          <FulfillmentPanel counts={fulfillmentCounts} pipeline={pipeline} />
          <OrderTimelinePanel orders={recentOrders} />
        </div>
      </section>

      <section className="space-y-3" aria-label="Activity and sales">
        <SectionHeading title="Activity &amp; sales" description="Recent branch activity and invoices" />
        <div className="grid gap-4 lg:grid-cols-2">
          <ActivityLogPanel entries={erpActivity} />
          <RecentInvoicesPanel invoices={recentErpInvoices} />
        </div>
      </section>

      <section className="space-y-3" aria-label="Inventory">
        <SectionHeading title="Inventory" />
        <InventoryPanel
          alerts={alerts}
          inventory={inventory}
          lowStockCount={erpFinancial?.low_stock_count ?? inventory.productsNeedingRestock}
        />
      </section>
    </AdminPageLayout>
  );
}
