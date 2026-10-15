"use client";

import { useMemo } from "react";

import type { ReportDefinition } from "@/common/erp/report-types";
import { extractReportRows } from "@/common/erp/report-types";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { StatusBadge } from "@/modules/admin/components/status-badge";
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
import { ReportKpiStrip } from "../business-overview/report-kpi-strip";
import { BusinessReportLayout } from "../business-overview/business-report-layout";
import { buildReportKpis, computeColumnAggregates } from "../business-overview/report-summaries";
import { ReportTableTotalsRow } from "../business-overview/report-table-totals-row";
import {
  buildReportExportSource,
  formatReportCell,
  matchesReportSearch,
  reportFiltersSubtitle,
} from "../business-overview/report-format";
import { useErpReportFetch } from "../business-overview/use-erp-report-fetch";
import { useInventoryReportFilters } from "./use-inventory-report-filters";

export function StockTransferReport({ report }: { report: ReportDefinition }) {
  const filters = useInventoryReportFilters(report);
  const { loading, error, rawData, reload } = useErpReportFetch(report, {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    asOf: filters.asOf,
    storeId: filters.storeId,
    channel: filters.channel,
    accountId: "",
    fromStoreId: filters.fromStoreId,
    toStoreId: filters.toStoreId,
    status: filters.transferStatus,
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
    "request_date",
    "desc",
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
      searchPlaceholder="Search transfer #, store, or requester…"
      metrics={
        !loading && sorted.length > 0 ? <ReportKpiStrip items={kpis} /> : null
      }
    >
      {error ? <p className="px-4 py-3 text-sm text-destructive">{error}</p> : null}
      {loading ? (
        <AdminDataTable>
          <AdminDataTableRowsSkeleton rows={10} columns={8} />
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
                    className={col.align === "right" ? "text-right" : undefined}
                  >
                    {col.key === "requested_qty" ||
                    col.key === "approved_qty" ||
                    col.key === "received_qty" ? (
                      <QtyBadges
                        req={Number(row.requested_qty ?? 0)}
                        apr={Number(row.approved_qty ?? 0)}
                        rec={Number(row.received_qty ?? 0)}
                        field={col.key}
                      />
                    ) : col.key === "payment_paid" || col.key === "payment_balance" ? (
                      <PaymentBadges
                        amount={Number(row.payment_amount ?? row.requested_items_price ?? 0)}
                        paid={Number(row.payment_paid ?? 0)}
                        balance={Number(row.payment_balance ?? 0)}
                        field={col.key}
                      />
                    ) : col.key === "status" ? (
                      <StatusBadge status={String(row.status ?? "—")} />
                    ) : (
                      <span className={col.align === "right" ? "tabular-nums" : undefined}>
                        {formatReportCell(row[col.key], col.format)}
                      </span>
                    )}
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
          <AdminListFooter total={sorted.length} label="transfers" page={0} pageSize={sorted.length} />
        </div>
      ) : null}
    </BusinessReportLayout>
  );
}

function QtyBadges({
  req,
  apr,
  rec,
  field,
}: {
  req: number;
  apr: number;
  rec: number;
  field: string;
}) {
  const map = {
    requested_qty: { label: "REQ", value: req, className: "bg-muted text-foreground" },
    approved_qty: { label: "APR", value: apr, className: "bg-teal-100 text-teal-800" },
    received_qty: { label: "REC", value: rec, className: "bg-emerald-100 text-emerald-800" },
  } as const;
  const item = map[field as keyof typeof map];
  if (!item) return null;
  return (
    <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${item.className}`}>
      {item.label}: {item.value.toLocaleString()}
    </span>
  );
}

function PaymentBadges({
  amount,
  paid,
  balance,
  field,
}: {
  amount: number;
  paid: number;
  balance: number;
  field: string;
}) {
  if (field === "payment_paid") {
    return (
      <span className="inline-flex rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-emerald-800">
        PAID: {formatCurrencyAmount(paid)}
      </span>
    );
  }
  return (
    <span className="inline-flex rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-rose-800">
      BALA: {formatCurrencyAmount(balance)}
    </span>
  );
}
