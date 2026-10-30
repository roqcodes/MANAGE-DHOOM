"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DataExportMenu } from "@/components/export/data-export-menu";
import {
  buildReportExportSource,
  formatReportPeriodRange,
} from "@/modules/admin/views/reports/business-overview/report-format";

import type { ReportChannel, ReportDefinition } from "@/common/erp/report-types";
import { extractReportRows } from "@/common/erp/report-types";
import { BusinessOverviewReport } from "@/modules/admin/views/reports/business-overview-report";
import { SalesReport } from "@/modules/admin/views/reports/sales-report";
import { InventoryReport } from "@/modules/admin/views/reports/inventory-report";
import { PayablesReport } from "@/modules/admin/views/reports/payables-report";
import { PaymentsPayablesReport } from "@/modules/admin/views/reports/payments-payables-report";
import { PurchasesReport } from "@/modules/admin/views/reports/purchases-report";
import { AccountantReport } from "@/modules/admin/views/reports/accountant-report";
import { ReceivablesReport } from "@/modules/admin/views/reports/receivables-report";
import { ActivityReport } from "@/modules/admin/views/reports/activity-report";
import { TaxesReport } from "@/modules/admin/views/reports/taxes-report";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { AdminBreadcrumb } from "@/modules/admin/components/admin-breadcrumb";
import { AdminTableBodySkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { useErpStores } from "@/modules/erp/components/use-erp-stores";
import { SortableTableHead, useSortableData } from "@/modules/admin/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAdminDateRange, useDebouncedValue } from "@/modules/admin/ui";
import { useErpReportFetch } from "@/modules/admin/views/reports/business-overview/use-erp-report-fetch";
import { useSalesmanReportFilter } from "@/modules/admin/views/reports/business-overview/use-salesman-report-filter";
import { useAddressHierarchyFilters } from "@/modules/customers/hooks/use-address-hierarchy-filters";
import { reportUsesAddressHierarchyFilters } from "@/modules/customers/lib/address-hierarchy-filter";
import { AddressHierarchyFilterInline } from "@/modules/customers/components/address-hierarchy-filter-fields";
import { InputGroup } from "@/components/ui/input-group";
import { AppErrorCalloutMessage } from "@/modules/feedback/components/app-error-callout";
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
    ["Revenue (period)", data.revenue_ytd ?? data.total_income_ytd],
    ["Gross profit (period)", data.gross_profit_ytd],
    ["COGS YTD", data.cogs_ytd],
    ["Expenses YTD", data.expenses_ytd],
    ["Net income (period)", data.net_income_ytd ?? data.net_profit_ytd],
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
  if (report.category === "Business Overview") {
    return <BusinessOverviewReport report={report} />;
  }

  if (report.category === "Sales") {
    return <SalesReport report={report} />;
  }

  if (report.category === "Inventory") {
    return <InventoryReport report={report} />;
  }

  if (report.category === "Purchases and Expenses") {
    return <PurchasesReport report={report} />;
  }

  if (report.category === "Receivables") {
    return <ReceivablesReport report={report} />;
  }

  if (report.category === "Payables") {
    return <PayablesReport report={report} />;
  }

  if (report.category === "Payments Received") {
    return <PaymentsPayablesReport report={report} />;
  }

  if (report.category === "Taxes") {
    return <TaxesReport report={report} />;
  }

  if (report.category === "Accountant") {
    return <AccountantReport report={report} />;
  }

  if (report.category === "Activity") {
    return <ActivityReport report={report} />;
  }

  return <GenericReportViewer report={report} />;
}

function GenericReportViewer({ report }: { report: ReportDefinition }) {
  const { stores, activeStoreId } = useErpStores();
  const [accounts, setAccounts] = useState<{ id: string; code: string; name: string }[]>([]);

  const today = new Date().toISOString().slice(0, 10);
  const { from: dateFrom, to: dateTo } = useAdminDateRange({ defaultPreset: "this_month" });
  const [asOf, setAsOf] = useState(today);
  const [channel, setChannel] = useState<ReportChannel>("all");
  const [accountId, setAccountId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [vendorSearch, setVendorSearch] = useState("");
  const debouncedCustomerSearch = useDebouncedValue(customerSearch, 250);
  const debouncedVendorSearch = useDebouncedValue(vendorSearch, 250);

  const effectiveStoreId = activeStoreId || "";

  useEffect(() => {
    if (!report.filters.account) return;
    const q = new URLSearchParams({ page: "0", limit: "500" });
    if (effectiveStoreId) q.set("storeId", effectiveStoreId);
    adminGet<{ data: { id: string; code: string; name: string }[] }>(`erp/accounts?${q.toString()}`)
      .then((res) => setAccounts(res.data ?? []))
      .catch(() => setAccounts([]));
  }, [report.filters.account, effectiveStoreId]);

  const serverSearch = report.filters.vendorSearch
    ? debouncedVendorSearch
    : debouncedCustomerSearch;

  const { salesmanId } = useSalesmanReportFilter(report);
  const address = useAddressHierarchyFilters();
  const showAddressFilters = reportUsesAddressHierarchyFilters(report);
  const { loading, error, rawData, reload } = useErpReportFetch(report, {
    dateFrom,
    dateTo,
    asOf,
    storeId: effectiveStoreId,
    channel,
    accountId,
    search:
      report.filters.customerSearch || report.filters.vendorSearch
        ? serverSearch
        : undefined,
    salesmanId,
    cityId: address.params.cityId ?? undefined,
    streetId: address.params.streetId ?? undefined,
    mallId: address.params.mallId ?? undefined,
  });

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

  const exportSource = buildReportExportSource({
    slug: report.slug,
    title: report.title,
    columns: displayColumns.map((col) => ({
      key: col.key,
      label: col.label,
      format: col.format,
    })),
    getRows: () => sorted as Record<string, unknown>[],
    getSubtitle: () => formatReportPeriodRange(dateFrom, dateTo),
  });

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
        {sorted.length > 0 ? (
          <DataExportMenu source={exportSource} />
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          {showAddressFilters ? (
            <div className="w-full min-w-0 basis-full">
              <InputGroup className="h-9 max-w-2xl">
                <AddressHierarchyFilterInline {...address.toolbarProps} />
              </InputGroup>
            </div>
          ) : null}
          {report.filters.dateRange ? (
            <p className="text-xs text-muted-foreground self-center">
              Date range: use the picker in the top header (next to search).
            </p>
          ) : null}
          {report.filters.asOfDate ? (
            <div className="space-y-1">
              <Label>As of</Label>
              <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
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
          {report.filters.customerSearch ? (
            <div className="space-y-1">
              <Label>Search customer</Label>
              <Input
                className="min-w-[200px]"
                placeholder="Name, phone, or invoice #"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
              />
            </div>
          ) : null}
          {report.filters.vendorSearch ? (
            <div className="space-y-1">
              <Label>Search vendor</Label>
              <Input
                className="min-w-[200px]"
                placeholder="Vendor name"
                value={vendorSearch}
                onChange={(e) => setVendorSearch(e.target.value)}
              />
            </div>
          ) : null}
          <Button size="sm" onClick={() => reload()}>
            Run report
          </Button>
        </CardContent>
      </Card>

      {error ? (
        <AppErrorCalloutMessage message={error} title="Couldn't run report" onRetry={() => reload()} />
      ) : null}
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
