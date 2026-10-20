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
} from "./business-overview/report-format";
import { buildReportKpis, computeColumnAggregates, hasAggregatableColumns } from "./business-overview/report-summaries";
import { ReportTableTotalsRow } from "./business-overview/report-table-totals-row";
import { resolveAgingReportColumns } from "./business-overview/aging-report-columns";
import { useAgingSummaryReportQuery } from "./business-overview/aging-report-shared";
import { useErpReportFetch } from "./business-overview/use-erp-report-fetch";

function customerDetailsHref(
  customerId: string,
  asOf: string,
  storeId: string,
  salesmanId: string,
) {
  const q = new URLSearchParams();
  if (asOf) q.set("asOf", asOf);
  if (storeId) q.set("storeId", storeId);
  if (salesmanId) q.set("salesmanId", salesmanId);
  const qs = q.toString();
  return `/admin/erp/reports/customer-aging-summary/${customerId}${qs ? `?${qs}` : ""}`;
}

export function CustomerAgingSummaryReport({ report }: { report: ReportDefinition }) {
  const serverSearch = Boolean(report.filters.customerSearch);
  const { filters, fetchParams, ageToolbar, exportSubtitle, ageMinDays, ageMaxDays } =
    useAgingSummaryReportQuery(report, serverSearch);
  const { loading, error, rawData, reload } = useErpReportFetch(report, fetchParams);

  const rows = useMemo(
    () => extractReportRows(rawData, report.rowsKey) as Record<string, unknown>[],
    [rawData, report.rowsKey],
  );

  const filtered = useMemo(() => {
    if (serverSearch) return rows;
    return rows.filter((row) => matchesReportSearch(row, filters.debouncedSearch));
  }, [rows, filters.debouncedSearch, serverSearch]);

  const columns = useMemo(
    () => resolveAgingReportColumns(report.columns, ageMinDays, ageMaxDays),
    [report.columns, ageMinDays, ageMaxDays],
  );

  const defaultSortKey = columns[0]?.key ?? "customer_name";
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
    () => buildReportKpis(columns, sorted, aggregates),
    [columns, sorted, aggregates],
  );

  const showFooterTotals = hasAggregatableColumns(columns);
  const isEmpty = !loading && sorted.length === 0;

  const exportSource = buildReportExportSource({
    slug: report.slug,
    title: report.title,
    columns,
    getRows: () => sorted,
    getSubtitle: exportSubtitle,
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
      toolbarExtra={ageToolbar}
      metrics={!loading && kpis.length > 0 ? <ReportKpiStrip items={kpis} /> : null}
    >
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
            {sorted.map((row, i) => {
              const customerId = String(row.customer_id ?? "");
              const customerName = String(row.customer_name ?? "—");
              return (
                <AdminTableRow key={customerId || i}>
                  {columns.map((col) => (
                    <AdminTableCell
                      key={col.key}
                      className={col.align === "right" ? "text-right tabular-nums" : undefined}
                    >
                      {col.key === "customer_name" && customerId ? (
                        <Link
                          href={customerDetailsHref(
                            customerId,
                            filters.asOf,
                            filters.storeId,
                            filters.salesmanId,
                          )}
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
    </BusinessReportLayout>
  );
}
