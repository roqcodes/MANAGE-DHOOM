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
import { AgingReportAgeFilter } from "../business-overview/aging-report-age-filter";
import { BusinessReportLayout } from "../business-overview/business-report-layout";
import { ReportKpiStrip } from "../business-overview/report-kpi-strip";
import { ReportTableTotalsRow } from "../business-overview/report-table-totals-row";
import {
  buildReportExportSource,
  formatDeadStockReportSubtitle,
  formatReportCell,
} from "../business-overview/report-format";
import { useAgingReportAgeExtras } from "../business-overview/use-aging-report-filters";
import { useErpReportFetch } from "../business-overview/use-erp-report-fetch";
import { useInventoryReportFilters } from "./use-inventory-report-filters";

const EXPIRED_DAY_PRESETS: { label: string; min: string; max: string }[] = [
  { label: "≥ 10 days", min: "10", max: "" },
  { label: "≥ 15 days", min: "15", max: "" },
  { label: "10–150 days", min: "10", max: "150" },
  { label: "30–90 days", min: "30", max: "90" },
];

type DeadStockRow = Record<string, unknown> & {
  quantity?: number;
  days_expired?: number;
  stock_purchase_value?: number;
};

export function DeadStockReport({ report }: { report: ReportDefinition }) {
  const filters = useInventoryReportFilters(report);
  const age = useAgingReportAgeExtras(report);
  const { loading, isFetching, error, rawData, reload } = useErpReportFetch(report, {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    asOf: filters.asOf,
    storeId: filters.storeId,
    channel: filters.channel,
    accountId: "",
    brandId: filters.brandId,
    categoryId: filters.categoryId,
    search: filters.debouncedSearch,
    ageMinDays: age.ageMinDays,
    ageMaxDays: age.ageMaxDays,
  });

  const rows = useMemo(
    () => extractReportRows(rawData, report.rowsKey) as DeadStockRow[],
    [rawData, report.rowsKey],
  );

  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    rows,
    "days_expired",
    "desc",
    (row, key) => row[key],
  );

  const totals = useMemo(
    () => ({
      qty: sorted.reduce((s, r) => s + Number(r.quantity ?? 0), 0),
      value: sorted.reduce((s, r) => s + Number(r.stock_purchase_value ?? 0), 0),
    }),
    [sorted],
  );

  const isEmpty = !loading && sorted.length === 0;

  const kpiItems = useMemo(
    () =>
      sorted.length === 0
        ? []
        : [
            { label: "Lots", value: sorted.length.toLocaleString() },
            { label: "Est. dead qty", value: totals.qty.toLocaleString() },
            { label: "Value at cost", value: formatCurrencyAmount(totals.value) },
          ],
    [sorted.length, totals],
  );

  const exportSource = buildReportExportSource({
    slug: report.slug,
    title: report.title,
    columns: report.columns,
    getRows: () => sorted,
    getSubtitle: () =>
      formatDeadStockReportSubtitle({
        asOf: filters.asOf,
        ageMinDays: age.ageMinDays,
        ageMaxDays: age.ageMaxDays,
      }),
  });

  return (
    <BusinessReportLayout
      report={report}
      filters={filters}
      loading={loading}
      fetching={isFetching}
      isEmpty={isEmpty}
      emptyMessage="No expired stock for the selected filters. Adjust store, category, days-since-expiry, or as-of date."
      onRefresh={reload}
      exportSource={exportSource}
      showDateRange={false}
      showAsOf
      searchPlaceholder="Search code, name, category, brand, store, or source #…"
      error={error}
      metrics={!loading && sorted.length > 0 ? <ReportKpiStrip items={kpiItems} /> : null}
      toolbarExtra={
        age.enabled ? (
          <div className="flex flex-col gap-2">
            <AgingReportAgeFilter
              fieldLabel="Days since expiry"
              unitLabel="days"
              ageMin={age.ageMin}
              ageMax={age.ageMax}
              onAgeMinChange={age.setAgeMin}
              onAgeMaxChange={age.setAgeMax}
              onClear={age.clear}
              idPrefix="dead-stock-expired"
            />
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Quick range:</span>
              {EXPIRED_DAY_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  className="rounded-md border border-border bg-background px-2 py-0.5 text-xs text-foreground hover:bg-muted"
                  onClick={() => age.setAgeMinMax(preset.min, preset.max)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        ) : null
      }
    >
      <div className="border-b bg-amber-50/80 px-4 py-2 text-xs text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
        Estimates on-hand quantity allocated to purchase lines that are past expiry (FIFO by expiry
        date). For full batch tracking, receive stock with expiry on each line. See{" "}
        <Link href="/admin/erp/reports/item-stock" className="font-medium text-primary hover:underline">
          item stock
        </Link>
        .
      </div>
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
                    className={cn(
                      col.align === "right" && "text-right tabular-nums",
                      col.key === "days_expired" && "font-medium text-destructive",
                      col.key === "quantity" && "font-semibold",
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
          <AdminListFooter total={sorted.length} label="lots" page={0} pageSize={sorted.length} />
        </div>
      ) : null}
    </BusinessReportLayout>
  );
}
