"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";

import type { ReportDefinition } from "@/common/erp/report-types";
import { extractReportRows } from "@/common/erp/report-types";
import { formatCurrencyAmount } from "@/lib/format-currency";
import {
  AdminDataTable,
  AdminDataTableRowsSkeleton,
  AdminListFooter,
  AdminTableBody,
  AdminTableCell,
  AdminTableHeader,
  AdminTableRow,
  SortableTableHead,
  useSortableData,
} from "@/modules/admin/ui";
import { cn } from "@/lib/utils";
import { BusinessReportLayout } from "../business-overview/business-report-layout";
import { exportReportCsv, formatReportCell, matchesReportSearch } from "../business-overview/report-format";
import { useBusinessReportFilters } from "../business-overview/use-business-report-filters";
import { useErpReportFetch } from "../business-overview/use-erp-report-fetch";

function reportSearchPlaceholder(report: ReportDefinition) {
  if (report.filters.vendorSearch) return "Search vendor…";
  if (report.filters.customerSearch) return "Search customer, phone, or invoice…";
  switch (report.slug) {
    case "sales-by-customer":
      return "Search customer…";
    case "sales-by-item":
      return "Search item…";
    case "credit-note-report":
      return "Search credit note, customer, invoice…";
    case "purchase-by-vendor":
      return "Search vendor…";
    case "payments-received":
      return "Search customer, invoice, store, or payment type…";
    default:
      return "Search report…";
  }
}

export function SalesTabularReport({
  report,
  showTotals = false,
  footnote,
  footer,
}: {
  report: ReportDefinition;
  showTotals?: boolean;
  footnote?: string;
  footer?: (rawData: unknown) => ReactNode;
}) {
  const filters = useBusinessReportFilters(report);
  const serverSearch = Boolean(report.filters.customerSearch || report.filters.vendorSearch);
  const { loading, error, rawData, reload } = useErpReportFetch(report, {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    asOf: filters.asOf,
    storeId: filters.storeId,
    channel: filters.channel,
    accountId: "",
    search: serverSearch ? filters.debouncedSearch : undefined,
  });

  const rows = useMemo(
    () => extractReportRows(rawData, report.rowsKey) as Record<string, unknown>[],
    [rawData, report.rowsKey],
  );

  const filtered = useMemo(() => {
    if (serverSearch) return rows;
    return rows.filter((row) => matchesReportSearch(row, filters.debouncedSearch));
  }, [rows, filters.debouncedSearch, serverSearch]);

  const defaultSortKey = report.columns[0]?.key ?? "id";
  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    filtered,
    defaultSortKey,
    "asc",
    (row, key) => row[key],
  );

  const totals = useMemo(() => {
    if (!showTotals) return null;
    const sums: Record<string, number> = {};
    for (const col of report.columns) {
      if (col.format !== "currency" && col.format !== "number") continue;
      sums[col.key] = sorted.reduce((acc, row) => acc + Number(row[col.key] ?? 0), 0);
    }
    return sums;
  }, [showTotals, report.columns, sorted]);

  const isEmpty = !loading && sorted.length === 0;

  function exportCsv() {
    exportReportCsv(report.slug, report.columns, sorted);
  }

  const showDateRange = Boolean(report.filters.dateRange);
  const showAsOf = Boolean(report.filters.asOfDate && !report.filters.dateRange);

  return (
    <BusinessReportLayout
      report={report}
      filters={filters}
      loading={loading}
      isEmpty={isEmpty}
      onExport={exportCsv}
      onRefresh={reload}
      showDateRange={showDateRange}
      showAsOf={showAsOf}
      searchPlaceholder={reportSearchPlaceholder(report)}
    >
      {error ? <p className="px-4 py-3 text-sm text-destructive">{error}</p> : null}
      {footnote ? (
        <p className="border-b bg-amber-50/80 px-4 py-2 text-xs text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
          {footnote}
        </p>
      ) : null}
      {loading ? (
        <AdminDataTable>
          <AdminDataTableRowsSkeleton rows={10} columns={report.columns.length} />
        </AdminDataTable>
      ) : (
        <AdminDataTable>
          <AdminTableHeader>
            {report.columns.map((col) => (
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
          </AdminTableHeader>
          <AdminTableBody>
            {sorted.map((row, i) => (
              <AdminTableRow key={String(row.id ?? `${i}`)}>
                {report.columns.map((col) => (
                  <AdminTableCell
                    key={col.key}
                    className={col.align === "right" ? "text-right tabular-nums" : undefined}
                  >
                    {formatReportCell(row[col.key], col.format)}
                  </AdminTableCell>
                ))}
              </AdminTableRow>
            ))}
            {showTotals && totals && sorted.length > 0 ? (
              <AdminTableRow className="bg-muted/50 font-semibold hover:bg-muted/50">
                {report.columns.map((col, idx) => (
                  <AdminTableCell
                    key={col.key}
                    className={cn(
                      col.align === "right" ? "text-right tabular-nums" : undefined,
                      idx === 0 && "text-foreground",
                    )}
                  >
                    {idx === 0
                      ? "Total"
                      : totals[col.key] != null
                        ? col.format === "currency"
                          ? formatCurrencyAmount(totals[col.key])
                          : totals[col.key].toLocaleString(undefined, { maximumFractionDigits: 3 })
                        : "—"}
                  </AdminTableCell>
                ))}
              </AdminTableRow>
            ) : null}
          </AdminTableBody>
        </AdminDataTable>
      )}
      {!loading && sorted.length > 0 ? (
        <div className="border-t px-3 py-2">
          <AdminListFooter total={sorted.length} label="rows" page={0} pageSize={sorted.length} />
        </div>
      ) : null}
      {!loading && footer ? footer(rawData) : null}
    </BusinessReportLayout>
  );
}
