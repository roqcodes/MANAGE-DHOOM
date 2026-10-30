"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import type { ReportDefinition } from "@/common/erp/report-types";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import {
  buildErpReportApiPath,
  type ErpReportFetchParams,
} from "@/modules/erp/lib/erp-report-api-path";

/** Activity reports default to all stores (optional store filter). */
const REPORTS_WITH_OPTIONAL_STORE = new Set(["activity-logs", "deleted-invoices"]);

function isErpReportFetchEnabled(
  report: ReportDefinition,
  params: ErpReportFetchParams,
): boolean {
  if (report.slug === "stock-transfer-report") {
    return Boolean(params.fromStoreId && params.toStoreId);
  }
  if (REPORTS_WITH_OPTIONAL_STORE.has(report.slug)) {
    return true;
  }
  if (report.filters.store) {
    return Boolean(params.storeId);
  }
  return true;
}

export function useErpReportFetch(
  report: ReportDefinition,
  params: ErpReportFetchParams,
) {
  const path = useMemo(
    () => buildErpReportApiPath(report, params),
    [
      report.slug,
      report.filters.dateRange,
      report.filters.asOfDate,
      report.filters.store,
      report.filters.channel,
      report.filters.account,
      report.filters.brand,
      report.filters.category,
      report.filters.stockLevel,
      report.filters.fromStore,
      report.filters.toStore,
      report.filters.status,
      report.filters.customerSearch,
      report.filters.vendorSearch,
      report.filters.storeSearch,
      report.filters.accountType,
      report.filters.ageRange,
      report.filters.expiredDaysRange,
      report.filters.salesman,
      params.dateFrom,
      params.dateTo,
      params.asOf,
      params.storeId,
      params.channel,
      params.accountId,
      params.brandId,
      params.categoryId,
      params.stockLevel,
      params.fromStoreId,
      params.toStoreId,
      params.status,
      params.search,
      params.accountTypeId,
      params.entityType,
      params.action,
      params.userId,
      params.customerId,
      params.vendorId,
      params.ageMinDays,
      params.ageMaxDays,
      params.salesmanId,
      params.cityId,
      params.streetId,
      params.mallId,
      params.expiryView,
      params.expiryWindowDays,
    ],
  );

  const query = useQuery({
    queryKey: adminQueryKeys.erpGet(path),
    queryFn: async () => {
      const res = await adminGet<{ data: unknown }>(path);
      return res.data;
    },
    enabled: isErpReportFetchEnabled(report, params),
    placeholderData: keepPreviousData,
    staleTime: 45_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });

  const error =
    query.error instanceof Error
      ? query.error.message
      : query.error
        ? "Failed to load report"
        : null;

  return {
    loading: query.isLoading,
    isFetching: query.isFetching,
    error,
    rawData: query.data ?? null,
    reload: () => query.refetch(),
  };
}
