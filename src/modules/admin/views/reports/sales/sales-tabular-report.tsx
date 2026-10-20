"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";

import type { ReportDefinition } from "@/common/erp/report-types";
import { extractReportRows } from "@/common/erp/report-types";
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
import { BusinessReportLayout } from "../business-overview/business-report-layout";
import { ReportKpiStrip } from "../business-overview/report-kpi-strip";
import {
  buildReportExportSource,
  formatReportCell,
  matchesReportSearch,
  reportFiltersSubtitle,
} from "../business-overview/report-format";
import { buildReportKpis, computeColumnAggregates, hasAggregatableColumns } from "../business-overview/report-summaries";
import { ReportTableTotalsRow } from "../business-overview/report-table-totals-row";
import { resolveAgingReportColumns } from "../business-overview/aging-report-columns";
import { AgingReportAgeFilter } from "../business-overview/aging-report-age-filter";
import { formatAgingReportSubtitle } from "../business-overview/report-format";
import { useAgingReportAgeExtras } from "../business-overview/use-aging-report-filters";
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
  footnote,
  footer,
  kpiExtra,
}: {
  report: ReportDefinition;
  footnote?: string;
  footer?: (rawData: unknown) => ReactNode;
  kpiExtra?: { label: string; value: string }[];
}) {
  const filters = useBusinessReportFilters(report);
  const age = useAgingReportAgeExtras(report);
  const serverSearch = Boolean(report.filters.customerSearch || report.filters.vendorSearch);
  const { loading, isFetching, error, rawData, reload } = useErpReportFetch(report, {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    asOf: filters.asOf,
    storeId: filters.storeId,
    channel: filters.channel,
    accountId: "",
    search: serverSearch ? filters.debouncedSearch : undefined,
    ageMinDays: age.ageMinDays,
    ageMaxDays: age.ageMaxDays,
    salesmanId: filters.salesmanId,
  });

  const rows = useMemo(
    () => extractReportRows(rawData, report.rowsKey) as Record<string, unknown>[],
    [rawData, report.rowsKey],
  );

  const filtered = useMemo(() => {
    if (serverSearch) return rows;
    return rows.filter((row) => matchesReportSearch(row, filters.debouncedSearch));
  }, [rows, filters.debouncedSearch, serverSearch]);

  const columns = useMemo(
    () =>
      age.enabled
        ? resolveAgingReportColumns(report.columns, age.ageMinDays, age.ageMaxDays)
        : report.columns,
    [report.columns, age.enabled, age.ageMinDays, age.ageMaxDays],
  );

  const defaultSortKey = columns[0]?.key ?? "id";
  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    filtered,
    defaultSortKey,
    "asc",
    (row, key) => row[key],
  );

  const aggregates = useMemo(
    () => computeColumnAggregates(columns, sorted),
    [columns, sorted],
  );

  const kpis = useMemo(
    () => buildReportKpis(columns, sorted, aggregates, kpiExtra),
    [columns, sorted, aggregates, kpiExtra],
  );

  const showFooterTotals = hasAggregatableColumns(columns);
  const isEmpty = !loading && sorted.length === 0;

  const showDateRange = Boolean(report.filters.dateRange);
  const showAsOf = Boolean(report.filters.asOfDate && !report.filters.dateRange);

  const exportSource = buildReportExportSource({
    slug: report.slug,
    title: report.title,
    columns,
    getRows: () => sorted,
    getSubtitle: () =>
      age.enabled
        ? formatAgingReportSubtitle({
            asOf: filters.asOf,
            ageMinDays: age.ageMinDays,
            ageMaxDays: age.ageMaxDays,
          })
        : reportFiltersSubtitle(filters, showAsOf ? "asOf" : "range"),
  });

  return (
    <BusinessReportLayout
      report={report}
      filters={filters}
      loading={loading}
      fetching={isFetching}
      isEmpty={isEmpty}
      exportSource={exportSource}
      onRefresh={() => reload()}
      showDateRange={showDateRange}
      showAsOf={showAsOf}
      searchPlaceholder={reportSearchPlaceholder(report)}
      error={error}
      toolbarExtra={
        age.enabled ? (
          <AgingReportAgeFilter
            ageMin={age.ageMin}
            ageMax={age.ageMax}
            onAgeMinChange={age.setAgeMin}
            onAgeMaxChange={age.setAgeMax}
          />
        ) : null
      }
      metrics={
        !loading && kpis.length > 0 ? <ReportKpiStrip items={kpis} /> : null
      }
    >
      {footnote ? (
        <p className="border-b bg-amber-50/80 px-4 py-2 text-xs text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
          {footnote}
        </p>
      ) : null}
      {loading ? (
        <AdminDataTable>
          <AdminDataTableRowsSkeleton rows={10} columns={columns.length} />
        </AdminDataTable>
      ) : (
        <AdminDataTable>
          <AdminTableHeader>
            {columns.map((col) => (
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
                {columns.map((col) => (
                  <AdminTableCell
                    key={col.key}
                    className={col.align === "right" ? "text-right tabular-nums" : undefined}
                  >
                    {formatReportCell(row[col.key], col.format)}
                  </AdminTableCell>
                ))}
              </AdminTableRow>
            ))}
            {showFooterTotals ? (
              <ReportTableTotalsRow columns={columns} rows={sorted} />
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
