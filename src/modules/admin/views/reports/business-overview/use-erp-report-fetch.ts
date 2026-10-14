"use client";

import { useCallback, useEffect, useState } from "react";

import type { ReportChannel, ReportDefinition, ReportStockLevel } from "@/common/erp/report-types";
import { adminGet } from "@/modules/admin/lib/admin-api-client";

export function useErpReportFetch(
  report: ReportDefinition,
  params: {
    dateFrom: string;
    dateTo: string;
    asOf: string;
    storeId: string;
    channel: ReportChannel;
    accountId: string;
    brandId?: string;
    categoryId?: string;
    stockLevel?: ReportStockLevel;
    fromStoreId?: string;
    toStoreId?: string;
    status?: string;
    search?: string;
    accountTypeId?: string;
    entityType?: string;
    action?: string;
    userId?: string;
  },
) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rawData, setRawData] = useState<unknown>(null);

  const loadReport = useCallback(() => {
    setLoading(true);
    setError(null);
    const q = new URLSearchParams();
    q.set("slug", report.slug);
    if (report.filters.dateRange) {
      q.set("dateFrom", params.dateFrom);
      q.set("dateTo", params.dateTo);
    }
    if (report.filters.asOfDate) q.set("asOf", params.asOf);
    if (report.filters.store && params.storeId) q.set("storeId", params.storeId);
    if (report.filters.channel) q.set("channel", params.channel);
    if (report.filters.account && params.accountId) q.set("accountId", params.accountId);
    if (report.filters.brand && params.brandId) q.set("brandId", params.brandId);
    if (report.filters.category && params.categoryId) q.set("categoryId", params.categoryId);
    if (report.filters.stockLevel && params.stockLevel) q.set("stockLevel", params.stockLevel);
    if (report.filters.fromStore && params.fromStoreId) q.set("fromStoreId", params.fromStoreId);
    if (report.filters.toStore && params.toStoreId) q.set("toStoreId", params.toStoreId);
    if (report.filters.status && params.status && params.status !== "all") {
      q.set("status", params.status);
    }
    const serverSearch =
      report.filters.customerSearch || report.filters.vendorSearch || report.filters.storeSearch
        ? params.search?.trim()
        : "";
    if (serverSearch) q.set("search", serverSearch);
    if (report.filters.accountType && params.accountTypeId) {
      q.set("accountTypeId", params.accountTypeId);
    }
    if (params.entityType && params.entityType !== "all") {
      q.set("entityType", params.entityType);
    }
    if (params.action && params.action !== "all") {
      q.set("action", params.action);
    }
    if (params.userId && params.userId !== "all") {
      q.set("userId", params.userId);
    }

    return adminGet<{ data: unknown }>(`erp/reports?${q.toString()}`)
      .then((res) => setRawData(res.data))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load report"))
      .finally(() => setLoading(false));
  }, [
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
  ]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  return { loading, error, rawData, reload: loadReport };
}
