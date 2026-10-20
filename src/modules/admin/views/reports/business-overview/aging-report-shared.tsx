"use client";

import type { ReactNode } from "react";

import type { ReportDefinition } from "@/common/erp/report-types";
import type { ErpReportFetchParams } from "@/modules/erp/lib/erp-report-api-path";

import { AgingReportAgeFilter } from "./aging-report-age-filter";
import { formatAgingReportSubtitle } from "./report-format";
import { useAgingReportAgeExtras } from "./use-aging-report-filters";
import { useBusinessReportFilters } from "./use-business-report-filters";

export function useAgingSummaryReportQuery(
  report: ReportDefinition,
  serverSearch: boolean,
) {
  const filters = useBusinessReportFilters(report);
  const age = useAgingReportAgeExtras(report);

  const fetchParams: ErpReportFetchParams = {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    asOf: filters.asOf,
    storeId: filters.storeId,
    channel: filters.channel,
    accountId: "",
    search: serverSearch ? filters.debouncedSearch : undefined,
    ageMinDays: age.ageMinDays,
    ageMaxDays: age.ageMaxDays,
    salesmanId: filters.salesmanId,
  };

  const ageToolbar: ReactNode = age.enabled ? (
    <AgingReportAgeFilter
      ageMin={age.ageMin}
      ageMax={age.ageMax}
      onAgeMinChange={age.setAgeMin}
      onAgeMaxChange={age.setAgeMax}
    />
  ) : null;

  const exportSubtitle = () =>
    formatAgingReportSubtitle({
      asOf: filters.asOf,
      ageMinDays: age.ageMinDays,
      ageMaxDays: age.ageMaxDays,
    });

  return {
    filters,
    fetchParams,
    ageToolbar,
    exportSubtitle,
    ageMinDays: age.ageMinDays,
    ageMaxDays: age.ageMaxDays,
  };
}
