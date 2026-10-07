"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";

import type { ReportChannel, ReportDefinition } from "@/common/erp/report-types";
import { extractReportRows } from "@/common/erp/report-types";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { AdminBreadcrumb } from "@/modules/admin/components/admin-breadcrumb";
import { AdminTableBodySkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { useErpStores } from "@/modules/erp/components/use-erp-stores";
import { SortableTableHead, useSortableData } from "@/modules/admin/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatCell(value: unknown, format?: string) {
  if (value == null || value === "") return "—";
  if (format === "currency" && typeof value === "number") return formatCurrencyAmount(value);
  if (format === "number" && typeof value === "number") return value.toLocaleString();
  if (format === "date" && typeof value === "string") return value.slice(0, 10);
  return String(value);
}

function FinanceSummaryCards({ data }: { data: Record<string, unknown> }) {
  const cards = [
    ["Accounts receivable", data.accounts_receivable],
    ["Accounts payable", data.accounts_payable],
    ["Net income YTD", data.net_income_ytd],
    ["COGS YTD", data.cogs_ytd],
    ["Expenses YTD", data.expenses_ytd],
    ["Net profit YTD", data.net_profit_ytd],
    ["Low stock items", data.low_stock_count],
  ] as const;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map(([label, value]) => (
        <Card key={label}>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {typeof value === "number" && label !== "Low stock items"
                ? formatCurrencyAmount(value)
                : String(value ?? "—")}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ProfitLossSummary({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="mb-4 flex flex-wrap gap-4 text-sm">
      <span>
        Income:{" "}
        <strong className="tabular-nums">
          {formatCurrencyAmount(Number(data.total_income ?? 0))}
        </strong>
      </span>
      <span>
        Expenses:{" "}
        <strong className="tabular-nums">
          {formatCurrencyAmount(Number(data.total_expenses ?? 0))}
        </strong>
      </span>
      <span>
        Net profit:{" "}
        <strong className="tabular-nums">
          {formatCurrencyAmount(Number(data.net_profit ?? 0))}
        </strong>
      </span>
    </div>
  );
}

export function ReportViewer({ report }: { report: ReportDefinition }) {
  const { stores, activeStoreId } = useErpStores();
  const [accounts, setAccounts] = useState<{ id: string; code: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rawData, setRawData] = useState<unknown>(null);

  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 8)}01`;
  const [dateFrom, setDateFrom] = useState(monthStart);
  const [dateTo, setDateTo] = useState(today);
  const [asOf, setAsOf] = useState(today);
  const [storeId, setStoreId] = useState("");
  const [channel, setChannel] = useState<ReportChannel>("all");
  const [accountId, setAccountId] = useState("");

  useEffect(() => {
    if (activeStoreId) setStoreId(activeStoreId);
  }, [activeStoreId]);

  useEffect(() => {
    if (!report.filters.account) return;
    const q = new URLSearchParams({ page: "0", limit: "500" });
    if (storeId) q.set("storeId", storeId);
    adminGet<{ data: { id: string; code: string; name: string }[] }>(`erp/accounts?${q.toString()}`)
      .then((res) => setAccounts(res.data ?? []))
      .catch(() => setAccounts([]));
  }, [report.filters.account, storeId]);

  function loadReport() {
    setLoading(true);
    setError(null);
    const q = new URLSearchParams();
    q.set("slug", report.slug);
    if (report.filters.dateRange) {
      q.set("dateFrom", dateFrom);
      q.set("dateTo", dateTo);
    }
    if (report.filters.asOfDate) q.set("asOf", asOf);
    if (report.filters.store && storeId) q.set("storeId", storeId);
    else if (report.filters.store && activeStoreId) q.set("storeId", activeStoreId);
    if (report.filters.channel) q.set("channel", channel);
    if (report.filters.account && accountId) q.set("accountId", accountId);

    adminGet<{ data: unknown }>(`erp/reports?${q.toString()}`)
      .then((res) => setRawData(res.data))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load report"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.slug, storeId, dateFrom, dateTo, asOf, channel, accountId]);

  const rows = useMemo(
    () => extractReportRows(rawData, report.rowsKey),
    [rawData, report.rowsKey],
  );

  const displayColumns =
    report.slug === "profit-and-loss" && rows.some((r) => r.section)
      ? [
          { key: "section", label: "Section" },
          { key: "account_code", label: "Code" },
          { key: "account_name", label: "Account" },
          { key: "amount", label: "Amount", align: "right" as const, format: "currency" as const },
        ]
      : report.columns;

  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    rows,
    displayColumns[0]?.key ?? "id",
    "asc",
    (row, key) => row[key],
  );

  function exportCsv() {
    if (rows.length === 0) return;
    const headers = displayColumns.map((c) => c.label);
    const lines = rows.map((row) =>
      displayColumns.map((col) => String(row[col.key] ?? "")).join(","),
    );
    const csv = [headers.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.slug}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-6">
      <AdminBreadcrumb
        backHref="/admin/erp/reports"
        items={[
          { label: "Reports", href: "/admin/erp/reports" },
          { label: report.title },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{report.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{report.description}</p>
        </div>
        {rows.length > 0 ? (
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download data-icon="inline-start" />
            Export CSV
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          {report.filters.dateRange ? (
            <>
              <div className="space-y-1">
                <Label>From</Label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>To</Label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </>
          ) : null}
          {report.filters.asOfDate ? (
            <div className="space-y-1">
              <Label>As of</Label>
              <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
            </div>
          ) : null}
          {report.filters.store ? (
            <div className="space-y-1">
              <Label>Store</Label>
              <select
                className="h-9 min-w-[180px] rounded-md border border-input bg-background px-3 text-sm"
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
              >
                <option value="">All stores</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {report.filters.channel ? (
            <div className="space-y-1">
              <Label>Channel</Label>
              <select
                className="h-9 min-w-[140px] rounded-md border border-input bg-background px-3 text-sm"
                value={channel}
                onChange={(e) => setChannel(e.target.value as ReportChannel)}
              >
                <option value="all">All</option>
                <option value="erp">ERP / Store</option>
                <option value="online">Online</option>
              </select>
            </div>
          ) : null}
          {report.filters.account ? (
            <div className="space-y-1">
              <Label>Account</Label>
              <select
                className="h-9 min-w-[220px] rounded-md border border-input bg-background px-3 text-sm"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                <option value="">Select account</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} — {a.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <Button size="sm" onClick={loadReport}>
            Run report
          </Button>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {loading ? <AdminTableBodySkeleton rows={10} /> : null}

      {!loading && report.slug === "finance-summary" && rawData ? (
        <FinanceSummaryCards data={rawData as Record<string, unknown>} />
      ) : null}

      {!loading && report.slug === "profit-and-loss" && rawData ? (
        <ProfitLossSummary data={rawData as Record<string, unknown>} />
      ) : null}

      {!loading && displayColumns.length > 0 ? (
        <Card>
          <CardContent className="overflow-x-auto pt-4">
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data for selected filters.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {displayColumns.map((col) => (
                      <SortableTableHead
                        key={col.key}
                        label={col.label}
                        sortKey={col.key}
                        activeKey={sortKey}
                        direction={sortDirection}
                        onSort={toggleSort}
                        align={col.align === "right" ? "right" : "left"}
                        className={col.align === "right" ? "text-right" : undefined}
                      />
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((row, i) => (
                    <TableRow key={i}>
                      {displayColumns.map((col) => (
                        <TableCell
                          key={col.key}
                          className={col.align === "right" ? "text-right tabular-nums" : undefined}
                        >
                          {formatCell(row[col.key], col.format)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <p className="mt-3 text-xs text-muted-foreground">{rows.length} rows</p>
          </CardContent>
        </Card>
      ) : null}

      {!loading && report.slug === "general-ledger" && rawData && typeof rawData === "object" ? (
        <p className="text-sm text-muted-foreground">
          Opening balance:{" "}
          <span className="font-medium tabular-nums">
            {formatCurrencyAmount(Number((rawData as Record<string, unknown>).opening_balance ?? 0))}
          </span>
        </p>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Need account drill-down? Open{" "}
        <Link href="/admin/erp/accounts" className="text-primary hover:underline">
          Chart of accounts
        </Link>{" "}
        or run General Ledger with a specific account.
      </p>
    </div>
  );
}
