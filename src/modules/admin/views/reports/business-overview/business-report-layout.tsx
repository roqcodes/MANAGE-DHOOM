"use client";

import type { ReactNode } from "react";
import { Download, RefreshCw } from "lucide-react";

import type { ReportDefinition } from "@/common/erp/report-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AdminDateRangePicker,
  AdminListCard,
  AdminPageHeader,
  AdminPageLayout,
} from "@/modules/admin/ui";
import { ReportPeriodBanner } from "./report-period-banner";
import type { useBusinessReportFilters } from "./use-business-report-filters";

export type BusinessReportFilters = ReturnType<typeof useBusinessReportFilters>;

export function BusinessReportLayout({
  report,
  filters,
  onExport,
  onRefresh,
  loading,
  isEmpty,
  emptyMessage,
  children,
  toolbarExtra,
  showDateRange = true,
  showAsOf = false,
  searchPlaceholder,
}: {
  report: ReportDefinition;
  filters: BusinessReportFilters;
  onExport?: () => void;
  onRefresh?: () => void;
  loading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  children: ReactNode;
  toolbarExtra?: ReactNode;
  showDateRange?: boolean;
  showAsOf?: boolean;
  searchPlaceholder?: string;
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
              <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
                <RefreshCw
                  data-icon="inline-start"
                  className={loading ? "animate-spin" : undefined}
                />
                Refresh
              </Button>
            ) : null}
            {onExport ? (
              <Button variant="outline" size="sm" onClick={onExport} disabled={isEmpty}>
                <Download data-icon="inline-start" />
                Export CSV
              </Button>
            ) : null}
          </>
        }
      />

      <ReportPeriodBanner periodLabel={filters.periodLabel} storeLabel={filters.storeLabel} />

      <AdminListCard
        isLoading={loading}
        search={filters.search}
        onSearchChange={filters.setSearch}
        searchPlaceholder={searchPlaceholder ?? "Search accounts, amounts, or references…"}
        isEmpty={Boolean(isEmpty)}
        emptyMessage={emptyMessage ?? "No data for the selected filters."}
        filters={filters.listFilters.length > 0 ? filters.listFilters : undefined}
        toolbarExtra={
          <div className="flex flex-wrap items-end gap-3">
            {showDateRange && report.filters.dateRange ? (
              <AdminDateRangePicker
                variant="standalone"
                value={filters.dateRangeValue}
                onChange={filters.setDateRange}
              />
            ) : null}
            {showAsOf && report.filters.asOfDate ? (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">As of date</Label>
                <Input
                  type="date"
                  className="h-9 w-[11rem]"
                  value={filters.asOf}
                  onChange={(e) => filters.setAsOf(e.target.value)}
                />
              </div>
            ) : null}
            {toolbarExtra}
          </div>
        }
      >
        {children}
      </AdminListCard>
    </AdminPageLayout>
  );
}
