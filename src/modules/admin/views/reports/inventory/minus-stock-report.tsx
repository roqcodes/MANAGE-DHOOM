"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import type { ReportColumn, ReportDefinition } from "@/common/erp/report-types";
import { extractReportRows } from "@/common/erp/report-types";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  formatReportProductCode,
  matchesReportSearch,
  reportFiltersSubtitle,
} from "../business-overview/report-format";
import { useErpReportFetch } from "../business-overview/use-erp-report-fetch";
import { useInventoryReportFilters } from "./use-inventory-report-filters";
import { ErrorsFeedbackBridge } from "@/modules/feedback/components/errors-feedback-bridge";
import {
  MinusStockDetailModal,
  type MinusStockTableRow,
} from "./minus-stock-detail-modal";
import { prefetchMinusStockDetail } from "./minus-stock-detail-query";

type StockView = "minus" | "zero";

type MinusStockRow = MinusStockTableRow &
  Record<string, unknown> & {
    stock?: number;
    stock_status?: string;
    shortage_qty?: number;
    shortage_cost?: number;
    stock_purchase_value?: number;
    stock_sales_value?: number;
    purchase_price?: number;
    sales_price?: number;
  };

function rowStock(row: MinusStockRow): number {
  return Number(row.stock ?? 0);
}

function isMinusRow(row: MinusStockRow): boolean {
  return rowStock(row) < 0;
}

function isZeroRow(row: MinusStockRow): boolean {
  return rowStock(row) === 0;
}

function parseStockView(raw: string | null): StockView {
  return raw === "zero" ? "zero" : "minus";
}

function columnsForView(view: StockView, all: ReportColumn[]): ReportColumn[] {
  if (view === "zero") {
    return all.filter((col) => col.key !== "shortage_qty" && col.key !== "shortage_cost");
  }
  return all;
}

function MinusStockReportTable({
  stockView,
  columns,
  rows,
  loading,
  onSelectMinusRow,
  onWarmDetail,
}: {
  stockView: StockView;
  columns: ReportColumn[];
  rows: MinusStockRow[];
  loading: boolean;
  onSelectMinusRow: (row: MinusStockTableRow) => void;
  onWarmDetail: (row: MinusStockRow) => void;
}) {
  const defaultSortKey = stockView === "minus" ? "stock" : "product_name";
  const defaultSortDir = stockView === "minus" ? "asc" : "asc";

  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    rows,
    defaultSortKey,
    defaultSortDir,
    (row, key) => row[key],
  );

  if (loading) {
    return (
      <AdminDataTable>
        <AdminDataTableRowsSkeleton rows={10} columns={columns.length} />
      </AdminDataTable>
    );
  }

  return (
    <>
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
            const minus = isMinusRow(row);
            const clickable = stockView === "minus" && minus;
            return (
              <AdminTableRow
                key={String(row.product_id ?? i)}
                className={clickable ? "cursor-pointer" : undefined}
                onClick={() => {
                  if (clickable) onSelectMinusRow(row);
                }}
                onMouseEnter={() => {
                  if (clickable) onWarmDetail(row);
                }}
                onFocus={() => {
                  if (clickable) onWarmDetail(row);
                }}
              >
                {columns.map((col) => (
                  <AdminTableCell
                    key={col.key}
                    className={cn(
                      col.align === "right" && "text-right tabular-nums",
                      col.key === "stock" &&
                        (minus
                          ? "font-semibold text-destructive"
                          : "font-medium text-amber-700 dark:text-amber-400"),
                      (col.key === "shortage_qty" || col.key === "shortage_cost") &&
                        "font-semibold text-destructive",
                      col.key === "product_code" && "font-mono text-xs",
                      col.key === "product_name" && "max-w-[220px] truncate font-medium",
                      col.key === "category_name" &&
                        row.category_name &&
                        "text-xs",
                    )}
                  >
                    {col.key === "product_code" ? (
                      formatReportProductCode(row.product_code, row)
                    ) : col.key === "category_name" && row.category_name ? (
                      <span className="rounded-md bg-muted px-2 py-0.5">
                        {String(row.category_name)}
                      </span>
                    ) : (
                      formatReportCell(row[col.key], col.format)
                    )}
                  </AdminTableCell>
                ))}
              </AdminTableRow>
            );
          })}
          <ReportTableTotalsRow columns={columns} rows={sorted} />
        </AdminTableBody>
      </AdminDataTable>
      {sorted.length > 0 ? (
        <div className="border-t px-3 py-2">
          <AdminListFooter total={sorted.length} label="items" page={0} pageSize={sorted.length} />
        </div>
      ) : null}
    </>
  );
}

export function MinusStockReport({ report }: { report: ReportDefinition }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const stockView = parseStockView(searchParams.get("stockView"));

  const filters = useInventoryReportFilters(report);
  const queryClient = useQueryClient();
  const [selectedRow, setSelectedRow] = useState<MinusStockTableRow | null>(null);
  const { loading, isFetching, error, rawData, reload } = useErpReportFetch(report, {
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

  const searched = useMemo(
    () => rows.filter((row) => matchesReportSearch(row, filters.debouncedSearch)),
    [rows, filters.debouncedSearch],
  );

  const tabRows = useMemo(
    () =>
      stockView === "zero"
        ? searched.filter(isZeroRow)
        : searched.filter(isMinusRow),
    [searched, stockView],
  );

  const columns = useMemo(
    () => columnsForView(stockView, report.columns),
    [stockView, report.columns],
  );

  const counts = useMemo(() => {
    let zero = 0;
    let minus = 0;
    for (const row of searched) {
      if (isMinusRow(row)) minus += 1;
      else if (isZeroRow(row)) zero += 1;
    }
    return { zero, minus };
  }, [searched]);

  const totals = useMemo(
    () => ({
      stock: tabRows.reduce((s, r) => s + Number(r.stock ?? 0), 0),
      shortage: tabRows.reduce((s, r) => s + Number(r.shortage_qty ?? 0), 0),
      shortageCost: tabRows.reduce((s, r) => s + Number(r.shortage_cost ?? 0), 0),
      purchaseValue: tabRows.reduce((s, r) => s + Number(r.stock_purchase_value ?? 0), 0),
      salesValue: tabRows.reduce((s, r) => s + Number(r.stock_sales_value ?? 0), 0),
    }),
    [tabRows],
  );

  const isEmpty = !loading && tabRows.length === 0;

  const kpiItems = useMemo(() => {
    if (tabRows.length === 0) return [];
    if (stockView === "zero") {
      return [
        { label: "Zero-stock SKUs", value: tabRows.length.toLocaleString() },
        { label: "On-hand (all zero)", value: totals.stock.toLocaleString() },
        { label: "Purchase value", value: formatCurrencyAmount(totals.purchaseValue) },
        { label: "Sales value", value: formatCurrencyAmount(totals.salesValue) },
      ];
    }
    return [
      { label: "Minus-stock SKUs", value: tabRows.length.toLocaleString() },
      { label: "Net on-hand", value: totals.stock.toLocaleString() },
      { label: "Shortage qty", value: totals.shortage.toLocaleString() },
      { label: "Shortage cost", value: formatCurrencyAmount(totals.shortageCost) },
    ];
  }, [stockView, tabRows.length, totals]);

  const exportSource = buildReportExportSource({
    slug: report.slug,
    title:
      stockView === "zero"
        ? `${report.title} — Zero stock`
        : `${report.title} — Minus stock`,
    columns,
    getRows: () =>
      tabRows.map((row) => ({
        ...row,
        product_code: formatReportProductCode(row.product_code, row),
      })),
    getSubtitle: () => reportFiltersSubtitle(filters, "asOf"),
  });

  const detailStoreId = filters.storeId || String(tabRows[0]?.store_id ?? rows[0]?.store_id ?? "");

  function warmDetail(row: MinusStockRow) {
    if (!isMinusRow(row)) return;
    const pid = row.product_id ? String(row.product_id) : "";
    prefetchMinusStockDetail(queryClient, detailStoreId, pid);
  }

  function setStockView(view: StockView) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("stockView", view);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  const emptyMessage =
    stockView === "zero"
      ? "No zero-stock SKUs for the selected store and filters."
      : "No minus-stock SKUs for the selected store and filters.";

  const infoBanner =
    stockView === "zero" ? (
      <div className="border-b bg-slate-50/90 px-4 py-2 text-xs text-slate-800 dark:bg-slate-900/40 dark:text-slate-200">
        SKUs with exactly <strong>zero</strong> on-hand at the selected store. Receive stock or transfer
        in to replenish. See{" "}
        <Link href="/admin/erp/reports/item-stock" className="font-medium text-primary hover:underline">
          full stock report
        </Link>{" "}
        for all levels.
      </div>
    ) : (
      <div className="border-b bg-amber-50/80 px-4 py-2 text-xs text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
        Negative on-hand usually means oversold quantity or a posting mismatch. Use{" "}
        <Link href="/admin/erp/stock-adjustments" className="font-medium text-primary hover:underline">
          stock adjustments
        </Link>{" "}
        or receive stock to correct balances. Click a row to see invoices that drove the shortage.
      </div>
    );

  return (
    <BusinessReportLayout
      report={report}
      filters={filters}
      loading={loading}
      fetching={isFetching}
      isEmpty={isEmpty}
      emptyMessage={emptyMessage}
      onRefresh={reload}
      exportSource={exportSource}
      showDateRange={false}
      searchPlaceholder="Search code, name, category, brand, or store…"
      error={error}
      metrics={!loading && tabRows.length > 0 ? <ReportKpiStrip items={kpiItems} /> : null}
    >
      <ErrorsFeedbackBridge errors={error} />
      <Tabs
        value={stockView}
        onValueChange={(v) => setStockView(parseStockView(v))}
        className="gap-0"
      >
        <div className="border-b px-4 pt-2">
          <TabsList variant="line" className="h-auto w-full flex-wrap justify-start">
            <TabsTrigger value="minus">
              Minus stock
              {counts.minus > 0 ? (
                <span className="ml-1.5 tabular-nums text-muted-foreground">
                  ({counts.minus.toLocaleString()})
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="zero">
              Zero stock
              {counts.zero > 0 ? (
                <span className="ml-1.5 tabular-nums text-muted-foreground">
                  ({counts.zero.toLocaleString()})
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>
        </div>
      </Tabs>
      {infoBanner}
      <MinusStockReportTable
        key={stockView}
        stockView={stockView}
        columns={columns}
        rows={tabRows}
        loading={loading}
        onSelectMinusRow={setSelectedRow}
        onWarmDetail={warmDetail}
      />
      {selectedRow && detailStoreId ? (
        <MinusStockDetailModal
          row={selectedRow}
          storeId={detailStoreId}
          onClose={() => setSelectedRow(null)}
        />
      ) : null}
    </BusinessReportLayout>
  );
}
