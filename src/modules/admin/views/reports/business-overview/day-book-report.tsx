"use client";

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
import { BusinessReportLayout } from "./business-report-layout";
import { ReportKpiStrip } from "./report-kpi-strip";
import { buildReportKpis, computeColumnAggregates } from "./report-summaries";
import { ReportTableTotalsRow } from "./report-table-totals-row";
import {
  buildReportExportSource,
  formatReportCell,
  matchesReportSearch,
  reportFiltersSubtitle,
} from "./report-format";
import { useBusinessReportFilters } from "./use-business-report-filters";
import { useErpReportFetch } from "./use-erp-report-fetch";

export function DayBookReport({ report }: { report: ReportDefinition }) {
  const filters = useBusinessReportFilters(report);
  const { loading, error, rawData, reload } = useErpReportFetch(report, {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    asOf: filters.asOf,
    storeId: filters.storeId,
    channel: filters.channel,
    accountId: "",
  });

  const rows = useMemo(
    () => extractReportRows(rawData, report.rowsKey) as Record<string, unknown>[],
    [rawData, report.rowsKey],
  );

  const filtered = useMemo(
    () => rows.filter((row) => matchesReportSearch(row, filters.debouncedSearch)),
    [rows, filters.debouncedSearch],
  );

  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    filtered,
    "transaction_date",
    "asc",
    (row, key) => row[key],
  );

  const aggregates = useMemo(
    () => computeColumnAggregates(report.columns, sorted),
    [report.columns, sorted],
  );
  const kpis = useMemo(
    () => buildReportKpis(report.columns, sorted, aggregates),
    [report.columns, sorted, aggregates],
  );

  const isEmpty = !loading && sorted.length === 0;

  const exportSource = buildReportExportSource({
    slug: report.slug,
    title: report.title,
    columns: report.columns,
    getRows: () => sorted,
    getSubtitle: () => reportFiltersSubtitle(filters, "range"),
  });

  return (
    <BusinessReportLayout
      report={report}
      filters={filters}
      loading={loading}
      isEmpty={isEmpty}
      onRefresh={reload}
      exportSource={exportSource}
      showDateRange
      metrics={
        !loading && sorted.length > 0 ? <ReportKpiStrip items={kpis} /> : null
      }
    >
      {error ? <p className="px-4 py-3 text-sm text-destructive">{error}</p> : null}
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
              <AdminTableRow key={String(row.id ?? i)}>
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
            <ReportTableTotalsRow columns={report.columns} rows={sorted} />
          </AdminTableBody>
        </AdminDataTable>
      )}
      {!loading && sorted.length > 0 ? (
        <div className="border-t px-3 py-2">
          <AdminListFooter total={sorted.length} label="transactions" page={0} pageSize={sorted.length} />
        </div>
      ) : null}
    </BusinessReportLayout>
  );
}
