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
import { BusinessReportLayout } from "../business-overview/business-report-layout";
import { ReportKpiStrip } from "../business-overview/report-kpi-strip";
import { buildReportKpis, computeColumnAggregates } from "../business-overview/report-summaries";
import { ReportTableTotalsRow } from "../business-overview/report-table-totals-row";
import {
  buildReportExportSource,
  formatDebitCreditAmount,
  formatReportCell,
  matchesReportSearch,
  reportFiltersSubtitle,
} from "../business-overview/report-format";
import { useErpReportFetch } from "../business-overview/use-erp-report-fetch";
import { useAccountantReportFilters } from "./use-accountant-report-filters";

export function AccountTransactionsReport({ report }: { report: ReportDefinition }) {
  const filters = useAccountantReportFilters(report);
  const { loading, error, rawData, reload } = useErpReportFetch(report, {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    asOf: filters.asOf,
    storeId: filters.storeId,
    channel: "all",
    accountId: filters.accountId,
    accountTypeId: filters.accountTypeId,
  });

  const rows = useMemo((): Record<string, unknown>[] => {
    const base = extractReportRows(rawData, report.rowsKey) as Record<string, unknown>[];
    return base.map((row) => ({
      ...row,
      amount_side: formatDebitCreditAmount(row.debit_amount, row.credit_amount),
    }));
  }, [rawData, report.rowsKey]);

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
      searchPlaceholder="Search transactions…"
      metrics={
        !loading && kpis.length > 0 ? <ReportKpiStrip items={kpis} /> : null
      }
    >
      {error ? <p className="px-4 py-3 text-sm text-destructive">{error}</p> : null}
      {loading ? (
        <AdminDataTable>
          <AdminDataTableRowsSkeleton rows={12} columns={report.columns.length} />
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
              <AdminTableRow key={String(row.line_id ?? i)}>
                {report.columns.map((col) => (
                  <AdminTableCell
                    key={col.key}
                    className={col.align === "right" ? "text-right tabular-nums" : undefined}
                  >
                    {col.key === "amount_side"
                      ? String(row.amount_side ?? "—")
                      : formatReportCell(row[col.key], col.format)}
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
          <AdminListFooter total={sorted.length} label="rows" page={0} pageSize={sorted.length} />
        </div>
      ) : null}
    </BusinessReportLayout>
  );
}
