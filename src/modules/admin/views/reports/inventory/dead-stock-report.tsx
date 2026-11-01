"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

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

type ExpiryView = "expired" | "near_expiry";

const EXPIRED_DAY_PRESETS: { label: string; min: string; max: string }[] = [
  { label: "≥ 10 days expired", min: "10", max: "" },
  { label: "≥ 30 days expired", min: "30", max: "" },
  { label: "10–150 days", min: "10", max: "150" },
  { label: "30–90 days", min: "30", max: "90" },
];

const EXPIRING_SOON_AGE_PRESETS: { label: string; min: string; max: string }[] = [
  { label: "Within 7 days", min: "", max: "7" },
  { label: "8–30 days", min: "8", max: "30" },
  { label: "Within 30 days", min: "", max: "30" },
];

const EXPIRY_WINDOW_PRESETS = [30, 60, 90] as const;

type DeadStockRow = Record<string, unknown> & {
  quantity?: number;
  days_expired?: number;
  days_to_expiry?: number;
  stock_purchase_value?: number;
};

function columnsForView(view: ExpiryView, all: ReportColumn[]): ReportColumn[] {
  return all.filter((col) => {
    if (view === "expired" && col.key === "days_to_expiry") return false;
    if (view === "near_expiry" && col.key === "days_expired") return false;
    return true;
  });
}

function parseExpiryView(raw: string | null): ExpiryView {
  return raw === "near_expiry" ? "near_expiry" : "expired";
}

function parseWindowDays(raw: string | null): number {
  const n = raw ? Number.parseInt(raw, 10) : 30;
  if (!Number.isFinite(n) || n < 1) return 30;
  return Math.min(n, 365);
}

function DeadStockReportTable({
  expiryView,
  columns,
  rows,
  loading,
}: {
  expiryView: ExpiryView;
  columns: ReportColumn[];
  rows: DeadStockRow[];
  loading: boolean;
}) {
  const defaultSortKey = expiryView === "near_expiry" ? "days_to_expiry" : "days_expired";
  const defaultSortDir = expiryView === "near_expiry" ? "asc" : "desc";

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
          {sorted.map((row, i) => (
            <AdminTableRow key={String(row.id ?? i)}>
              {columns.map((col) => (
                <AdminTableCell
                  key={col.key}
                  className={cn(
                    col.align === "right" && "text-right tabular-nums",
                    col.key === "days_expired" && "font-medium text-destructive",
                    col.key === "days_to_expiry" &&
                      Number(row.days_to_expiry ?? 0) <= 7 &&
                      "font-medium text-amber-700 dark:text-amber-400",
                    col.key === "quantity" && "font-semibold",
                  )}
                >
                  {formatReportCell(row[col.key], col.format)}
                </AdminTableCell>
              ))}
            </AdminTableRow>
          ))}
          <ReportTableTotalsRow columns={columns} rows={sorted} />
        </AdminTableBody>
      </AdminDataTable>
      {sorted.length > 0 ? (
        <div className="border-t px-3 py-2">
          <AdminListFooter total={sorted.length} label="lots" page={0} pageSize={sorted.length} />
        </div>
      ) : null}
    </>
  );
}

export function DeadStockReport({ report }: { report: ReportDefinition }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const expiryView = parseExpiryView(searchParams.get("expiryView"));
  const expiryWindowDays = parseWindowDays(searchParams.get("expiryWindowDays"));

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
    expiryView,
    expiryWindowDays,
  });

  const columns = useMemo(
    () => columnsForView(expiryView, report.columns),
    [expiryView, report.columns],
  );

  const rows = useMemo(
    () => extractReportRows(rawData, report.rowsKey) as DeadStockRow[],
    [rawData, report.rowsKey],
  );

  const totals = useMemo(
    () => ({
      qty: rows.reduce((s, r) => s + Number(r.quantity ?? 0), 0),
      value: rows.reduce((s, r) => s + Number(r.stock_purchase_value ?? 0), 0),
    }),
    [rows],
  );

  const isEmpty = !loading && rows.length === 0;

  const kpiItems = useMemo(() => {
    if (rows.length === 0) return [];
    if (expiryView === "near_expiry") {
      return [
        { label: "Expiring lots", value: rows.length.toLocaleString() },
        { label: "Est. qty expiring soon", value: totals.qty.toLocaleString() },
        { label: "Value at cost", value: formatCurrencyAmount(totals.value) },
      ];
    }
    return [
      { label: "Expired lots", value: rows.length.toLocaleString() },
      { label: "Est. expired qty", value: totals.qty.toLocaleString() },
      { label: "Value at cost", value: formatCurrencyAmount(totals.value) },
    ];
  }, [expiryView, rows.length, totals]);

  const exportSource = buildReportExportSource({
    slug: report.slug,
    title:
      expiryView === "near_expiry"
        ? `${report.title} — Expiring soon`
        : `${report.title} — Expired stock`,
    columns,
    getRows: () => rows,
    getSubtitle: () =>
      formatDeadStockReportSubtitle({
        asOf: filters.asOf,
        ageMinDays: age.ageMinDays,
        ageMaxDays: age.ageMaxDays,
        expiryView,
        expiryWindowDays,
      }),
  });

  function setExpiryView(view: ExpiryView) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("expiryView", view);
    if (view === "near_expiry" && !next.get("expiryWindowDays")) {
      next.set("expiryWindowDays", String(expiryWindowDays));
    }
    age.clear();
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  function setExpiryWindowDays(days: number) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("expiryWindowDays", String(days));
    next.set("expiryView", "near_expiry");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  const agePresets =
    expiryView === "near_expiry" ? EXPIRING_SOON_AGE_PRESETS : EXPIRED_DAY_PRESETS;
  const ageFieldLabel =
    expiryView === "near_expiry" ? "Days until expiry" : "Days since expiry";

  const emptyMessage =
    expiryView === "near_expiry"
      ? "No stock expiring soon for the selected filters. Try a wider expiry window, another store, or adjust days-until-expiry."
      : "No expired stock for the selected filters. Adjust store, category, days-since-expiry, or as-of date.";

  const infoBanner =
    expiryView === "near_expiry" ? (
      <div className="border-b bg-sky-50/80 px-4 py-2 text-xs text-sky-950 dark:bg-sky-950/30 dark:text-sky-100">
        Estimated on-hand quantity for lines expiring within the next {expiryWindowDays} days (FIFO
        by expiry date). Use batch expiry on receives for FEFO-grade accuracy.
      </div>
    ) : (
      <div className="border-b bg-amber-50/80 px-4 py-2 text-xs text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
        Estimated on-hand quantity allocated to lines past expiry (FIFO by expiry date). See{" "}
        <Link href="/admin/erp/reports/item-stock" className="font-medium text-primary hover:underline">
          item stock
        </Link>{" "}
        for current on-hand.
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
      showAsOf
      searchPlaceholder="Search item code, name, category, brand, store, or source document…"
      error={error}
      metrics={!loading && rows.length > 0 ? <ReportKpiStrip items={kpiItems} /> : null}
      toolbarExtra={
        age.enabled ? (
          <div className="flex flex-col gap-2">
            {expiryView === "near_expiry" ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Expiry window:</span>
                {EXPIRY_WINDOW_PRESETS.map((days) => (
                  <button
                    key={days}
                    type="button"
                    className={cn(
                      "rounded-md border px-2 py-0.5 text-xs",
                      expiryWindowDays === days
                        ? "border-primary bg-primary/10 font-medium text-primary"
                        : "border-border bg-background text-foreground hover:bg-muted",
                    )}
                    onClick={() => setExpiryWindowDays(days)}
                  >
                    Next {days} days
                  </button>
                ))}
              </div>
            ) : null}
            <AgingReportAgeFilter
              fieldLabel={ageFieldLabel}
              unitLabel="days"
              ageMin={age.ageMin}
              ageMax={age.ageMax}
              onAgeMinChange={age.setAgeMin}
              onAgeMaxChange={age.setAgeMax}
              onClear={age.clear}
              idPrefix={`dead-stock-${expiryView}`}
            />
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Quick range:</span>
              {agePresets.map((preset) => (
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
      <Tabs
        value={expiryView}
        onValueChange={(v) => setExpiryView(parseExpiryView(v))}
        className="gap-0"
      >
        <div className="border-b px-4 pt-2">
          <TabsList variant="line" className="h-auto w-full flex-wrap justify-start">
            <TabsTrigger value="expired">Expired stock</TabsTrigger>
            <TabsTrigger value="near_expiry">Expiring soon</TabsTrigger>
          </TabsList>
        </div>
      </Tabs>
      {infoBanner}
      <DeadStockReportTable
        key={expiryView}
        expiryView={expiryView}
        columns={columns}
        rows={rows}
        loading={loading}
      />
    </BusinessReportLayout>
  );
}
