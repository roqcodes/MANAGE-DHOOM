"use client";

import Link from "next/link";
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
import { BusinessReportLayout } from "../business-overview/business-report-layout";
import { exportReportCsv, formatReportCell, matchesReportSearch } from "../business-overview/report-format";
import { useErpReportFetch } from "../business-overview/use-erp-report-fetch";
import { useInventoryReportFilters } from "./use-inventory-report-filters";

type StockRow = Record<string, unknown> & {
  purchase_price?: number;
  sales_price?: number;
  stock_status?: string;
};

export function StockReport({ report }: { report: ReportDefinition }) {
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
    stockLevel: filters.stockLevel,
  });

  const rows = useMemo(
    () => extractReportRows(rawData, report.rowsKey) as StockRow[],
    [rawData, report.rowsKey],
  );

  const filtered = useMemo(
    () => rows.filter((row) => matchesReportSearch(row, filters.debouncedSearch)),
    [rows, filters.debouncedSearch],
  );

  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    filtered,
    "product_name",
    "asc",
    (row, key) => row[key],
  );

  const totals = useMemo(() => {
    return {
      stock: sorted.reduce((s, r) => s + Number(r.stock ?? 0), 0),
      purchaseValue: sorted.reduce((s, r) => s + Number(r.stock_purchase_value ?? 0), 0),
      salesValue: sorted.reduce((s, r) => s + Number(r.stock_sales_value ?? 0), 0),
    };
  }, [sorted]);

  const isEmpty = !loading && sorted.length === 0;
  const generatedAt = new Date().toLocaleString();

  function exportCsv() {
    exportReportCsv(report.slug, report.columns, sorted);
  }

  return (
    <BusinessReportLayout
      report={report}
      filters={filters}
      loading={loading}
      isEmpty={isEmpty}
      onRefresh={reload}
      onExport={exportCsv}
      showDateRange={false}
      searchPlaceholder="Search code, name, category, or brand…"
    >
      {error ? <p className="px-4 py-3 text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
        <span>
          Total items: <strong className="text-foreground">{sorted.length.toLocaleString()}</strong>
        </span>
        <span>Generated {generatedAt}</span>
        <Link href="/admin/erp/reports/store-wise-stock" className="text-primary hover:underline">
          View stock summary by store
        </Link>
      </div>
      {loading ? (
        <AdminDataTable>
          <AdminDataTableRowsSkeleton rows={12} columns={6} />
        </AdminDataTable>
      ) : (
        <AdminDataTable>
          <AdminTableHeader>
            <SortableTableHead label="Code" sortKey="product_code" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} />
            <SortableTableHead label="Name" sortKey="product_name" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} />
            <SortableTableHead label="Category" sortKey="category_name" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} />
            <SortableTableHead label="Brand" sortKey="brand_name" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} />
            <SortableTableHead label="Store" sortKey="store_name" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} />
            <SortableTableHead label="Stock" sortKey="stock" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} align="right" className="text-right" />
            <SortableTableHead label="Purchase value" sortKey="stock_purchase_value" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} align="right" className="text-right" />
            <SortableTableHead label="Sales value" sortKey="stock_sales_value" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} align="right" className="text-right" />
          </AdminTableHeader>
          <AdminTableBody>
            {sorted.map((row, i) => (
              <AdminTableRow key={String(row.product_id ?? i)}>
                <AdminTableCell className="font-mono text-xs">{formatReportCell(row.product_code)}</AdminTableCell>
                <AdminTableCell className="max-w-[220px] truncate font-medium">{formatReportCell(row.product_name)}</AdminTableCell>
                <AdminTableCell>
                  {row.category_name ? (
                    <span className="rounded-md bg-muted px-2 py-0.5 text-xs">{String(row.category_name)}</span>
                  ) : (
                    "—"
                  )}
                </AdminTableCell>
                <AdminTableCell className="text-muted-foreground">{formatReportCell(row.brand_name)}</AdminTableCell>
                <AdminTableCell>{formatReportCell(row.store_name)}</AdminTableCell>
                <AdminTableCell className="text-right">
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="rounded bg-primary/10 px-2 py-0.5 text-sm font-semibold tabular-nums text-primary">
                      {formatReportCell(row.stock, "number")}
                    </span>
                    <StockStatusBadge status={String(row.stock_status ?? "")} />
                  </div>
                </AdminTableCell>
                <AdminTableCell className="text-right">
                  <ValueCell total={Number(row.stock_purchase_value ?? 0)} avg={Number(row.purchase_price ?? 0)} avgLabel="Avg purch. cost" />
                </AdminTableCell>
                <AdminTableCell className="text-right">
                  <ValueCell total={Number(row.stock_sales_value ?? 0)} avg={Number(row.sales_price ?? 0)} avgLabel="Avg sale price" />
                </AdminTableCell>
              </AdminTableRow>
            ))}
            {sorted.length > 0 ? (
              <AdminTableRow className="bg-muted/50 font-semibold hover:bg-muted/50">
                <AdminTableCell>Total</AdminTableCell>
                <AdminTableCell> </AdminTableCell>
                <AdminTableCell> </AdminTableCell>
                <AdminTableCell> </AdminTableCell>
                <AdminTableCell> </AdminTableCell>
                <AdminTableCell className="text-right tabular-nums">{totals.stock.toLocaleString()}</AdminTableCell>
                <AdminTableCell className="text-right tabular-nums">{formatCurrencyAmount(totals.purchaseValue)}</AdminTableCell>
                <AdminTableCell className="text-right tabular-nums">{formatCurrencyAmount(totals.salesValue)}</AdminTableCell>
              </AdminTableRow>
            ) : null}
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

function StockStatusBadge({ status }: { status: string }) {
  const className =
    status === "Out of stock"
      ? "bg-destructive/10 text-destructive"
      : status === "Low stock"
        ? "bg-amber-100 text-amber-900"
        : "bg-emerald-100 text-emerald-800";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${className}`}>
      {status || "—"}
    </span>
  );
}

function ValueCell({ total, avg, avgLabel }: { total: number; avg: number; avgLabel: string }) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="tabular-nums font-medium">{formatCurrencyAmount(total)}</span>
      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
        {avgLabel}: {formatCurrencyAmount(avg)}
      </span>
    </div>
  );
}
