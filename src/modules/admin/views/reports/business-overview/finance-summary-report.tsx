"use client";

import { useMemo } from "react";

import type { ReportDefinition } from "@/common/erp/report-types";
import { extractReportRows, getReportBySlug } from "@/common/erp/report-types";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { useAdminGetQuery } from "@/modules/admin/lib/use-admin-get-query";
import { buildErpReportApiPath } from "@/modules/erp/lib/erp-report-api-path";
import { AdminTableBodySkeleton } from "@/modules/admin/components/admin-page-skeleton";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableCell,
  AdminTableHeader,
  AdminTableRow,
  SortableTableHead,
  useSortableData,
} from "@/modules/admin/ui";
import { BusinessReportLayout } from "./business-report-layout";
import {
  matchesReportSearch,
  partitionBalanceSheetRows,
  type TrialBalanceRow,
} from "./report-format";
import { useBusinessReportFilters } from "./use-business-report-filters";
import { useErpReportFetch } from "./use-erp-report-fetch";
import { ErrorsFeedbackBridge } from "@/modules/feedback/components/errors-feedback-bridge";

type PositionRow = {
  id: string;
  label: string;
  amount: number;
  side: "asset" | "liability";
};

export function FinanceSummaryReport({ report }: { report: ReportDefinition }) {
  const filters = useBusinessReportFilters(report);
  const { loading, error, rawData, reload } = useErpReportFetch(report, {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    asOf: filters.asOf,
    storeId: filters.storeId,
    channel: "all",
    accountId: "",
  });

  const balanceSheetReport = getReportBySlug("balance-sheet");
  const balancePath =
    balanceSheetReport &&
    buildErpReportApiPath(balanceSheetReport, {
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      asOf: filters.asOf,
      storeId: filters.storeId,
      channel: "all",
      accountId: "",
    });
  const positionQuery = useAdminGetQuery<{ data: unknown }>({
    path: balancePath ?? "erp/reports?slug=balance-sheet",
    enabled: Boolean(balancePath),
  });
  const positionLoading = positionQuery.isLoading;
  const positionRows = useMemo(
    () =>
      extractReportRows(positionQuery.data?.data, "rows") as TrialBalanceRow[],
    [positionQuery.data],
  );

  const metrics = (rawData ?? {}) as Record<string, unknown>;
  const { assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity } = useMemo(
    () => partitionBalanceSheetRows(positionRows),
    [positionRows],
  );

  const combined: PositionRow[] = useMemo(() => {
    const liabilityItems: PositionRow[] = [...liabilities, ...equity].map((r, i) => ({
      id: `l-${r.account_code}-${i}`,
      label: r.account_name ?? r.account_code ?? "—",
      amount: Number(r.balance ?? 0),
      side: "liability" as const,
    }));
    const assetItems: PositionRow[] = assets.map((r, i) => ({
      id: `a-${r.account_code}-${i}`,
      label: r.account_name ?? r.account_code ?? "—",
      amount: Number(r.balance ?? 0),
      side: "asset" as const,
    }));
    return [...liabilityItems, ...assetItems];
  }, [assets, liabilities, equity]);

  const filteredLiabilities = useMemo(() => {
    const q = filters.debouncedSearch;
    return combined.filter(
      (r) =>
        r.side === "liability" &&
        matchesReportSearch(
          { label: r.label, amount: r.amount } as Record<string, unknown>,
          q,
        ),
    );
  }, [combined, filters.debouncedSearch]);

  const filteredAssets = useMemo(() => {
    const q = filters.debouncedSearch;
    return combined.filter(
      (r) =>
        r.side === "asset" &&
        matchesReportSearch(
          { label: r.label, amount: r.amount } as Record<string, unknown>,
          q,
        ),
    );
  }, [combined, filters.debouncedSearch]);

  const liabilitySort = useSortableData(filteredLiabilities, "label", "asc", (row, key) =>
    key === "amount" ? row.amount : row.label,
  );
  const assetSort = useSortableData(filteredAssets, "label", "asc", (row, key) =>
    key === "amount" ? row.amount : row.label,
  );

  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;
  const busy = loading || positionLoading;
  const isEmpty = !busy && filteredLiabilities.length === 0 && filteredAssets.length === 0;

  return (
    <BusinessReportLayout
      report={report}
      filters={filters}
      loading={busy}
      isEmpty={isEmpty}
      onRefresh={() => {
        reload();
      }}
      showDateRange
    >
      <ErrorsFeedbackBridge errors={error} />
      {busy ? (
        <AdminTableBodySkeleton rows={8} />
      ) : (
        <div className="space-y-6 p-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <MetricCard label="Accounts receivable" value={Number(metrics.accounts_receivable ?? 0)} />
            <MetricCard label="Accounts payable" value={Number(metrics.accounts_payable ?? 0)} />
            <MetricCard label="Revenue (period)" value={Number(metrics.net_income_ytd ?? 0)} />
            <MetricCard label="COGS (recognized)" value={Number(metrics.cogs_ytd ?? 0)} />
            <MetricCard label="Purchases (bills)" value={Number(metrics.purchases_ytd ?? 0)} />
            <MetricCard label="Net profit (period)" value={Number(metrics.net_profit_ytd ?? 0)} />
          </div>
          <p className="text-xs text-muted-foreground px-1">
            Profit and COGS follow posted journals (same basis as Profit &amp; Loss). Purchase bills are
            inventory purchases, not period COGS. Low stock: {Number(metrics.low_stock_count ?? 0)} items.
          </p>

          <div className="grid gap-6 lg:grid-cols-2">
            <PositionColumn
              title="Liabilities & equity"
              accent="border-l-orange-500"
              total={totalLiabilitiesAndEquity}
              totalLabel="Total liabilities & equity"
              rows={liabilitySort.sorted}
              sortKey={liabilitySort.sortKey}
              sortDirection={liabilitySort.sortDirection}
              onSort={liabilitySort.toggleSort}
            />
            <PositionColumn
              title="Assets"
              accent="border-l-teal-500"
              total={totalAssets}
              totalLabel="Total assets"
              rows={assetSort.sorted}
              sortKey={assetSort.sortKey}
              sortDirection={assetSort.sortDirection}
              onSort={assetSort.toggleSort}
            />
          </div>
        </div>
      )}
    </BusinessReportLayout>
  );
}

function MetricCard({
  label,
  value,
  isCount,
}: {
  label: string;
  value: number;
  isCount?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight">
        {isCount ? value.toLocaleString() : formatCurrencyAmount(value)}
      </p>
    </div>
  );
}

function PositionColumn({
  title,
  accent,
  total,
  totalLabel,
  rows,
  sortKey,
  sortDirection,
  onSort,
}: {
  title: string;
  accent: string;
  total: number;
  totalLabel: string;
  rows: PositionRow[];
  sortKey: string | null;
  sortDirection: "asc" | "desc";
  onSort: (key: string) => void;
}) {
  return (
    <div className={`rounded-lg border border-l-4 bg-card ${accent}`}>
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      </div>
      <AdminDataTable>
        <AdminTableHeader>
          <SortableTableHead
            label="Account"
            sortKey="label"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={onSort}
          />
          <SortableTableHead
            label="Amount"
            sortKey="amount"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={onSort}
            align="right"
            className="text-right"
          />
        </AdminTableHeader>
        <AdminTableBody>
          {rows.map((row, index) => (
            <AdminTableRow key={row.id}>
              <AdminTableCell>
                <span className="mr-2 inline-flex size-6 items-center justify-center rounded bg-muted text-xs font-medium text-muted-foreground">
                  {index + 1}
                </span>
                {row.label}
              </AdminTableCell>
              <AdminTableCell className="text-right tabular-nums font-medium">
                {formatCurrencyAmount(row.amount)}
              </AdminTableCell>
            </AdminTableRow>
          ))}
        </AdminTableBody>
      </AdminDataTable>
      <div className="flex items-center justify-between border-t bg-muted/30 px-4 py-3">
        <span className="text-sm font-medium text-muted-foreground">{totalLabel}</span>
        <span className="text-lg font-semibold tabular-nums">{formatCurrencyAmount(total)}</span>
      </div>
    </div>
  );
}
