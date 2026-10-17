import type { ReportChannel, ReportDefinition, ReportStockLevel } from "@/common/erp/report-types";

export type ErpReportFetchParams = {
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
  customerId?: string;
  vendorId?: string;
  ageMinDays?: number;
  ageMaxDays?: number;
};

/** Stable admin API path for TanStack Query cache keys and fetch. */
export function buildErpReportApiPath(
  report: ReportDefinition,
  params: ErpReportFetchParams,
): string {
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
  if (params.customerId) q.set("customerId", params.customerId);
  if (params.vendorId) q.set("vendorId", params.vendorId);
  if (report.filters.ageRange) {
    if (params.ageMinDays != null) q.set("ageMinDays", String(params.ageMinDays));
    if (params.ageMaxDays != null) q.set("ageMaxDays", String(params.ageMaxDays));
  }
  return `erp/reports?${q.toString()}`;
}
