"use client";

import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";

import type { ReportDefinition } from "@/common/erp/report-types";
import { DataExportMenu } from "@/components/export/data-export-menu";
import type { TabularExportSource } from "@/lib/export/tabular-export";
import { AppErrorCalloutMessage } from "@/modules/feedback/components/app-error-callout";
import { Button } from "@/components/ui/button";
import { AdminListCard, AdminPageHeader, AdminPageLayout } from "@/modules/admin/ui";
import type { useBusinessReportFilters } from "./use-business-report-filters";

export type BusinessReportFilters = ReturnType<typeof useBusinessReportFilters>;

export function BusinessReportLayout({
  report,
  filters,
  exportSource,
  onExport,
  onRefresh,
  loading,
  fetching,
  isEmpty,
  emptyMessage,
  children,
  toolbarExtra,
  showDateRange = true,
  showAsOf = false,
  searchPlaceholder,
  metrics,
  error,
}: {
  report: ReportDefinition;
  filters: BusinessReportFilters;
  exportSource?: TabularExportSource;
  /** Legacy CSV-only handler; use exportSource when possible. */
  onExport?: () => void;
  onRefresh?: () => void;
  loading?: boolean;
  /** Background refetch (keeps prior rows visible). */
  fetching?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  children: ReactNode;
  toolbarExtra?: ReactNode;
  showDateRange?: boolean;
  showAsOf?: boolean;
  searchPlaceholder?: string;
  /** KPI bar — rendered above the list card, separate from the table. */
  metrics?: ReactNode;
  error?: string | null;
}) {
  return (
    <AdminPageLayout>
      <AdminPageHeader
        title={report.title}
        description={report.description}
        backHref="/admin/erp/reports"
        breadcrumb={[
          { label: "Reports", href: "/admin/erp/reports" },
          { label: report.title },
        ]}
        actions={
          <>
            {onRefresh ? (
              <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading || fetching}>
                <RefreshCw
                  data-icon="inline-start"
                  className={loading || fetching ? "animate-spin" : undefined}
                />
                Refresh
              </Button>
            ) : null}
            {exportSource ? (
              <DataExportMenu source={exportSource} disabled={isEmpty} />
            ) : onExport ? (
              <Button variant="outline" size="sm" onClick={onExport} disabled={isEmpty}>
                Export
              </Button>
            ) : null}
          </>
        }
      />

      {metrics}

      {error ? (
        <AppErrorCalloutMessage message={error} onRetry={onRefresh} />
      ) : null}

      <AdminListCard
        isLoading={loading}
        search={filters.search}
        onSearchChange={filters.setSearch}
        searchPlaceholder={searchPlaceholder ?? "Search accounts, amounts, or references…"}
        isEmpty={Boolean(isEmpty) && !error}
        emptyMessage={
          emptyMessage ??
          (error
            ? "Report could not be loaded."
            : "No data for the selected filters.")
        }
        filters={filters.listFilters.length > 0 ? filters.listFilters : undefined}
        inlineDateRange={
          showDateRange && report.filters.dateRange
            ? {
                value: filters.dateRangeValue,
                onChange: filters.setDateRange,
              }
            : showAsOf && report.filters.asOfDate
              ? {
                  value: filters.dateRangeValue,
                  onChange: filters.setDateRange,
                }
              : false
        }
        inlineAsOf={
          showAsOf && report.filters.asOfDate
            ? {
                value: filters.asOf,
                onChange: filters.setAsOf,
              }
            : false
        }
        toolbarExtra={toolbarExtra}
      >
        {children}
      </AdminListCard>
    </AdminPageLayout>
  );
}
