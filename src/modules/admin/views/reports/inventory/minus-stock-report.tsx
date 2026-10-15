"use client";

import Link from "next/link";
import { useMemo } from "react";

import type { ReportDefinition } from "@/common/erp/report-types";
import { extractReportRows } from "@/common/erp/report-types";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
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
import { ReportTableTotalsRow } from "../business-overview/report-table-totals-row";
import { BusinessReportLayout } from "../business-overview/business-report-layout";
import {
  buildReportExportSource,
  formatReportCell,
  matchesReportSearch,
  reportFiltersSubtitle,
} from "../business-overview/report-format";
import { useErpReportFetch } from "../business-overview/use-erp-report-fetch";
import { useInventoryReportFilters } from "./use-inventory-report-filters";

type MinusStockRow = Record<string, unknown> & {
  stock?: number;
  shortage_qty?: number;
  stock_purchase_value?: number;
  stock_sales_value?: number;
  purchase_price?: number;
  sales_price?: number;
};

export function MinusStockReport({ report }: { report: ReportDefinition }) {
  const filters = useInventoryReportFilters(report);
  const { loading, error, rawData, reload } = useErpReportFetch(report, {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    asOf: filters.asOf,
    storeId: filters.storeId,
    channel: filters.channel,
    accountId: "",
    brandId: filters.brandId,
    categoryId: filters.categoryId,
  });

  const rows = useMemo(
    () => extractReportRows(rawData, report.rowsKey) as MinusStockRow[],
    [rawData, report.rowsKey],
  );

  const filtered = useMemo(
    () => rows.filter((row) => matchesReportSearch(row, filters.debouncedSearch)),
    [rows, filters.debouncedSearch],
  );

  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    filtered,
    "stock",
    "asc",
    (row, key) => row[key],
  );

  const totals = useMemo(
    () => ({
      stock: sorted.reduce((s, r) => s + Number(r.stock ?? 0), 0),
      shortage: sorted.reduce((s, r) => s + Number(r.shortage_qty ?? 0), 0),
      purchaseValue: sorted.reduce((s, r) => s + Number(r.stock_purchase_value ?? 0), 0),
      salesValue: sorted.reduce((s, r) => s + Number(r.stock_sales_value ?? 0), 0),
    }),
    [sorted],
  );

  const isEmpty = !loading && sorted.length === 0;

  const kpiItems = useMemo(
    () =>
      sorted.length === 0
        ? []
        : [
            { label: "Lines", value: sorted.length.toLocaleString() },
            { label: "Net stock", value: totals.stock.toLocaleString() },
            { label: "Shortage qty", value: totals.shortage.toLocaleString() },
            { label: "Purchase value", value: formatCurrencyAmount(totals.purchaseValue) },
          ],
    [sorted.length, totals],
  );

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
      emptyMessage="No minus stock for the selected filters. Negative quantities appear when store stock is oversold or adjusted below zero."
      onRefresh={reload}
      exportSource={exportSource}
      showDateRange={false}
      searchPlaceholder="Search code, name, category, brand, or store…"
      metrics={
        !loading && sorted.length > 0 ? <ReportKpiStrip items={kpiItems} /> : null
      }
    >
      {error ? <p className="px-4 py-3 text-sm text-destructive">{error}</p> : null}
      <div className="border-b bg-amber-50/80 px-4 py-2 text-xs text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
        Lists store SKUs where on-hand quantity is below zero. Use{" "}
        <Link href="/admin/erp/stock-adjustments" className="font-medium text-primary hover:underline">
          stock adjustments
        </Link>{" "}
        or receive stock to correct balances.
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
        <span>
          Minus lines: <strong className="text-foreground">{sorted.length.toLocaleString()}</strong>
        </span>
        <Link href="/admin/erp/reports/item-stock" className="text-primary hover:underline">
          Full stock report
        </Link>
      </div>
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
                <AdminTableRow key={String(row.product_id ?? i)}>
                  {report.columns.map((col) => (
                    <AdminTableCell
                      key={col.key}
                      className={cn(
                        col.align === "right" && "text-right tabular-nums",
                        (col.key === "stock" || col.key === "shortage_qty") &&
                          "font-semibold text-destructive",
                      )}
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
          <AdminListFooter total={sorted.length} label="items" page={0} pageSize={sorted.length} />
        </div>
      ) : null}
    </BusinessReportLayout>
  );
}
