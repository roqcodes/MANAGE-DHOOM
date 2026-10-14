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
import { cn } from "@/lib/utils";
import { BusinessReportLayout } from "../business-overview/business-report-layout";
import { exportReportCsv, formatReportCell, matchesReportSearch } from "../business-overview/report-format";
import { useErpReportFetch } from "../business-overview/use-erp-report-fetch";
import { useInventoryReportFilters } from "../inventory/use-inventory-report-filters";

export function PurchaseByItemReport({ report }: { report: ReportDefinition }) {
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
    () => extractReportRows(rawData, report.rowsKey) as Record<string, unknown>[],
    [rawData, report.rowsKey],
  );

  const filtered = useMemo(
    () => rows.filter((row) => matchesReportSearch(row, filters.debouncedSearch)),
    [rows, filters.debouncedSearch],
  );

  const defaultSortKey = report.columns[0]?.key ?? "item_name";
  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    filtered,
    defaultSortKey,
    "asc",
    (row, key) => row[key],
  );

  const totals = useMemo(() => {
    const sums: Record<string, number> = {};
    for (const col of report.columns) {
      if (col.format !== "currency" && col.format !== "number") continue;
      if (col.key === "avg_purchase_cost") continue;
      sums[col.key] = sorted.reduce((acc, row) => acc + Number(row[col.key] ?? 0), 0);
    }
    return sums;
  }, [report.columns, sorted]);

  const isEmpty = !loading && sorted.length === 0;

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
      showDateRange
      searchPlaceholder="Search item…"
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
              <AdminTableRow key={String(row.product_id ?? row.item_name ?? i)}>
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
            {sorted.length > 0 ? (
              <AdminTableRow className="bg-muted/50 font-semibold hover:bg-muted/50">
                {report.columns.map((col, idx) => (
                  <AdminTableCell
                    key={col.key}
                    className={cn(
                      col.align === "right" ? "text-right tabular-nums" : undefined,
                      idx === 0 && "text-foreground",
                    )}
                  >
                    {idx === 0
                      ? "Total"
                      : col.key === "avg_purchase_cost"
                        ? "—"
                        : totals[col.key] != null
                          ? col.format === "currency"
                            ? formatCurrencyAmount(totals[col.key])
                            : totals[col.key].toLocaleString(undefined, { maximumFractionDigits: 3 })
                          : "—"}
                  </AdminTableCell>
                ))}
              </AdminTableRow>
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
