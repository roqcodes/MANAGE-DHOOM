"use client";

import Link from "next/link";
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
import { BusinessReportLayout } from "./business-overview/business-report-layout";
import { ReportKpiStrip } from "./business-overview/report-kpi-strip";
import {
  buildReportExportSource,
  formatReportCell,
  matchesReportSearch,
  reportFiltersSubtitle,
} from "./business-overview/report-format";
import { buildReportKpis, computeColumnAggregates, hasAggregatableColumns } from "./business-overview/report-summaries";
import { ReportTableTotalsRow } from "./business-overview/report-table-totals-row";
import { useBusinessReportFilters } from "./business-overview/use-business-report-filters";
import { useErpReportFetch } from "./business-overview/use-erp-report-fetch";

function customerDetailsHref(
  customerId: string,
  asOf: string,
  storeId: string,
) {
  const q = new URLSearchParams();
  if (asOf) q.set("asOf", asOf);
  if (storeId) q.set("storeId", storeId);
  const qs = q.toString();
  return `/admin/erp/reports/customer-aging-summary/${customerId}${qs ? `?${qs}` : ""}`;
}

export function CustomerAgingSummaryReport({ report }: { report: ReportDefinition }) {
  const filters = useBusinessReportFilters(report);
  const { loading, error, rawData, reload } = useErpReportFetch(report, {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    asOf: filters.asOf,
    storeId: filters.storeId,
    channel: filters.channel,
    accountId: "",
    search: report.filters.customerSearch ? filters.debouncedSearch : undefined,
  });

  const rows = useMemo(
    () => extractReportRows(rawData, report.rowsKey) as Record<string, unknown>[],
    [rawData, report.rowsKey],
  );

  const serverSearch = Boolean(report.filters.customerSearch);
  const filtered = useMemo(() => {
    if (serverSearch) return rows;
    return rows.filter((row) => matchesReportSearch(row, filters.debouncedSearch));
  }, [rows, filters.debouncedSearch, serverSearch]);

  const defaultSortKey = report.columns[0]?.key ?? "customer_name";
  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    filtered,
    defaultSortKey,
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

  const showFooterTotals = hasAggregatableColumns(report.columns);
  const isEmpty = !loading && sorted.length === 0;

  const exportSource = buildReportExportSource({
    slug: report.slug,
    title: report.title,
    columns: report.columns,
    getRows: () => sorted,
    getSubtitle: () => reportFiltersSubtitle(filters, "asOf"),
  });

  return (
    <BusinessReportLayout
      report={report}
      filters={filters}
      loading={loading}
      isEmpty={isEmpty}
      exportSource={exportSource}
      onRefresh={reload}
      showDateRange={false}
      showAsOf
      searchPlaceholder="Search customer, phone, or invoice…"
      error={error}
      metrics={!loading && sorted.length > 0 ? <ReportKpiStrip items={kpis} /> : null}
    >
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
            {sorted.map((row, i) => {
              const customerId = String(row.customer_id ?? "");
              const customerName = String(row.customer_name ?? "—");
              return (
                <AdminTableRow key={customerId || i}>
                  {report.columns.map((col) => (
                    <AdminTableCell
                      key={col.key}
                      className={col.align === "right" ? "text-right tabular-nums" : undefined}
                    >
                      {col.key === "customer_name" && customerId ? (
                        <Link
                          href={customerDetailsHref(customerId, filters.asOf, filters.storeId)}
                          className="font-medium text-primary hover:underline"
                        >
                          {customerName}
                        </Link>
                      ) : (
                        formatReportCell(row[col.key], col.format)
                      )}
                    </AdminTableCell>
                  ))}
                </AdminTableRow>
              );
            })}
            {showFooterTotals ? (
              <ReportTableTotalsRow columns={report.columns} rows={sorted} />
            ) : null}
          </AdminTableBody>
        </AdminDataTable>
      )}
      {!loading && sorted.length > 0 ? (
        <div className="border-t px-3 py-2">
          <AdminListFooter total={sorted.length} label="rows" page={0} pageSize={sorted.length} />
        </div>
      ) : null}
    </BusinessReportLayout>
  );
}
