"use client";

import { useEffect, useMemo } from "react";
import { RefreshCw } from "lucide-react";

import { VENDOR_AGING_SUMMARY_DETAILS_REPORT } from "@/common/erp/report-types";
import { extractReportRows } from "@/common/erp/report-types";
import {
  AdminDataTable,
  AdminDataTableRowsSkeleton,
  AdminListCard,
  AdminListFooter,
  AdminPageHeader,
  AdminPageLayout,
  AdminTableBody,
  AdminTableCell,
  AdminTableHeader,
  AdminTableRow,
  SortableTableHead,
  useSortableData,
} from "@/modules/admin/ui";
import { Button } from "@/components/ui/button";
import { DataExportMenu } from "@/components/export/data-export-menu";
import {
  buildReportExportSource,
  formatReportCell,
  reportFiltersSubtitle,
} from "./business-overview/report-format";
import { ReportTableTotalsRow } from "./business-overview/report-table-totals-row";
import { useBusinessReportFilters } from "./business-overview/use-business-report-filters";
import { useErpReportFetch } from "./business-overview/use-erp-report-fetch";

const report = VENDOR_AGING_SUMMARY_DETAILS_REPORT;

export function VendorAgingSummaryDetailsView({
  vendorId,
  initialAsOf,
  initialStoreId,
}: {
  vendorId: string;
  initialAsOf?: string;
  initialStoreId?: string;
}) {
  const filters = useBusinessReportFilters(report);

  useEffect(() => {
    if (initialAsOf) filters.setAsOf(initialAsOf);
    if (initialStoreId) filters.setStoreId(initialStoreId);
  }, [initialAsOf, initialStoreId, filters.setAsOf, filters.setStoreId]);

  const { loading, error, rawData, reload } = useErpReportFetch(report, {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    asOf: filters.asOf,
    storeId: filters.storeId,
    channel: filters.channel,
    accountId: "",
    vendorId,
  });

  const payload = (rawData ?? {}) as { vendor_name?: string };
  const vendorName = payload.vendor_name ?? "Vendor";

  const rows = useMemo(
    () => extractReportRows(rawData, report.rowsKey) as Record<string, unknown>[],
    [rawData],
  );

  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    rows,
    "due_date",
    "asc",
    (row, key) => row[key],
  );

  const isEmpty = !loading && sorted.length === 0;

  const exportSource = buildReportExportSource({
    slug: `vendor-aging-${vendorId}`,
    title: report.title,
    columns: report.columns,
    getRows: () => sorted,
    getSubtitle: () => reportFiltersSubtitle(filters, "asOf"),
  });

  const summaryBackQs = new URLSearchParams();
  if (filters.asOf) summaryBackQs.set("asOf", filters.asOf);
  if (filters.storeId) summaryBackQs.set("storeId", filters.storeId);
  const summaryBackHref = `/admin/erp/reports/vendor-aging-summary${
    summaryBackQs.toString() ? `?${summaryBackQs.toString()}` : ""
  }`;

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title={report.title}
        description={report.description}
        backHref={summaryBackHref}
        breadcrumb={[
          { label: "Reports", href: "/admin/erp/reports" },
          { label: "PB Aging Summary", href: summaryBackHref },
          { label: report.title },
        ]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
              <RefreshCw
                data-icon="inline-start"
                className={loading ? "animate-spin" : undefined}
              />
              Refresh
            </Button>
            <DataExportMenu source={exportSource} disabled={isEmpty} />
          </>
        }
      />

      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <AdminListCard
        isLoading={loading}
        isEmpty={isEmpty && !error}
        emptyMessage="No open bills for this vendor with the selected filters."
        search=""
        onSearchChange={() => {}}
        filters={filters.listFilters.length > 0 ? filters.listFilters : undefined}
        inlineAsOf={{
          value: filters.asOf,
          onChange: filters.setAsOf,
        }}
      >
        <p className="border-b bg-muted/30 px-4 py-3 text-center text-sm font-semibold">
          Vendor: {vendorName}
        </p>
        {loading ? (
          <AdminDataTable>
            <AdminDataTableRowsSkeleton rows={8} columns={report.columns.length} />
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
                <AdminTableRow key={`${row.purchase_bill_number ?? i}`}>
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
              <ReportTableTotalsRow columns={report.columns} rows={sorted} />
            </AdminTableBody>
          </AdminDataTable>
        )}
        {!loading && sorted.length > 0 ? (
          <div className="border-t px-3 py-2">
            <AdminListFooter total={sorted.length} label="bills" page={0} pageSize={sorted.length} />
          </div>
        ) : null}
      </AdminListCard>
    </AdminPageLayout>
  );
}
