"use client";

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
import type { ReportColumn } from "@/common/erp/report-types";
import { BusinessReportLayout } from "../business-overview/business-report-layout";
import { ReportKpiStrip } from "../business-overview/report-kpi-strip";
import { buildReportKpis, computeColumnAggregates } from "../business-overview/report-summaries";
import { ReportTableTotalsRow } from "../business-overview/report-table-totals-row";
import {
  buildReportExportSource,
  formatReportCell,
  matchesReportSearch,
  reportFiltersSubtitle,
} from "../business-overview/report-format";
import { useErpReportFetch } from "../business-overview/use-erp-report-fetch";
import { useAccountantReportFilters } from "./use-accountant-report-filters";
import { ErrorsFeedbackBridge } from "@/modules/feedback/components/errors-feedback-bridge";

const DETAIL_COLUMNS = [
  { key: "transaction_date", label: "Date", format: "date" as const },
  { key: "journal_number", label: "Journal #" },
  { key: "line_description", label: "Description" },
  { key: "debit_amount", label: "Debit", align: "right" as const, format: "currency" as const },
  { key: "credit_amount", label: "Credit", align: "right" as const, format: "currency" as const },
  { key: "running_balance", label: "Balance", align: "right" as const, format: "currency" as const },
];

export function GeneralLedgerReport({ report }: { report: ReportDefinition }) {
  const filters = useAccountantReportFilters(report);
  const detailMode = Boolean(filters.accountId);
  const { loading, error, rawData, reload } = useErpReportFetch(report, {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    asOf: filters.asOf,
    storeId: filters.storeId,
    channel: "all",
    accountId: filters.accountId,
  });

  const columns: ReportColumn[] = detailMode ? DETAIL_COLUMNS : report.columns;

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
    columns[0]?.key ?? "account_name",
    "asc",
    (row, key) => row[key],
  );

  const openingBalance =
    detailMode && rawData && typeof rawData === "object"
      ? Number((rawData as Record<string, unknown>).opening_balance ?? 0)
      : null;

  const aggregates = useMemo(
    () => computeColumnAggregates(columns, sorted),
    [columns, sorted],
  );
  const kpis = useMemo(() => {
    const extra =
      detailMode && openingBalance != null
        ? [{ label: "Opening balance", value: formatCurrencyAmount(openingBalance) }]
        : undefined;
    return buildReportKpis(columns, sorted, aggregates, extra);
  }, [columns, sorted, aggregates, detailMode, openingBalance]);

  const isEmpty = !loading && sorted.length === 0;

  const exportSource = buildReportExportSource({
    slug: report.slug,
    title: report.title,
    columns,
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
      searchPlaceholder={detailMode ? "Search journal lines…" : "Search account…"}
      metrics={
        !loading && kpis.length > 0 ? <ReportKpiStrip items={kpis} /> : null
      }
    >
      <ErrorsFeedbackBridge errors={error} />
      {detailMode && openingBalance != null ? (
        <p className="border-b px-4 py-2 text-sm text-muted-foreground">
          Opening balance:{" "}
          <span className="font-medium tabular-nums text-foreground">
            {formatCurrencyAmount(openingBalance)}
          </span>
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
              <AdminTableRow key={String(row.line_id ?? row.account_id ?? row.journal_id ?? i)}>
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
            <ReportTableTotalsRow columns={columns} rows={sorted} />
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
