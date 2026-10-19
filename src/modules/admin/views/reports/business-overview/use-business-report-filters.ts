"use client";

import { useEffect, useState } from "react";

import type { ReportChannel, ReportDefinition } from "@/common/erp/report-types";
import { applyAdminDatePreset } from "@/modules/admin/lib/admin-date-range";
import { useAdminDateRange, useDebouncedValue, type AdminListFilter } from "@/modules/admin/ui";
import { useErpStores } from "@/modules/erp/components/use-erp-stores";
import { formatReportAsOf, formatReportPeriodRange } from "./report-format";

export function useBusinessReportFilters(report: ReportDefinition) {
  const { stores, activeStoreId } = useErpStores();
  const today = new Date().toISOString().slice(0, 10);
  const defaultPreset =
    report.filters.asOfDate && !report.filters.dateRange
      ? "this_month"
      : report.category === "Sales" ||
          report.category === "Inventory" ||
          report.category === "Purchases and Expenses" ||
          report.category === "Receivables" ||
          report.category === "Payments Received" ||
          report.category === "Payables" ||
          report.category === "Taxes" ||
          report.category === "Accountant" ||
          report.category === "Activity"
        ? "this_month"
        : "ytd";
  const dateRange = useAdminDateRange({ defaultPreset });
  const [asOf, setAsOf] = useState(today);
  const [storeId, setStoreId] = useState("");
  const [channel, setChannel] = useState<ReportChannel>("all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 200);

  useEffect(() => {
    // Receivables + activity log: default to all stores (recent activity is global).
    if (report.category === "Receivables" || report.slug === "activity-logs") return;
    if (activeStoreId) setStoreId(activeStoreId);
  }, [activeStoreId, report.category, report.slug]);

  useEffect(() => {
    if (report.slug !== "activity-logs") return;
    dateRange.setDateRange(applyAdminDatePreset(defaultPreset));
  }, [report.slug, defaultPreset, dateRange.setDateRange]);

  useEffect(() => {
    if (!report.filters.asOfDate) return;
    if (dateRange.to) setAsOf(dateRange.to);
  }, [dateRange.to, report.filters.asOfDate]);

  const storeLabel =
    storeId ? stores.find((s) => s.id === storeId)?.name ?? "Selected store" : "All stores";

  const periodLabel =
    report.filters.asOfDate && !report.filters.dateRange
      ? `As of ${formatReportAsOf(asOf)}`
      : formatReportPeriodRange(dateRange.from, dateRange.to);

  const storeFilter: AdminListFilter = {
    id: "store",
    label: "Store",
    value: storeId || "all",
    options: [
      { value: "all", label: "All stores" },
      ...stores.map((s) => ({ value: s.id, label: s.name })),
    ],
    onChange: (v) => setStoreId(v === "all" ? "" : v),
  };

  const channelFilter: AdminListFilter = {
    id: "channel",
    label: "Channel",
    value: channel,
    options: [
      { value: "all", label: "All channels" },
      { value: "erp", label: "ERP / Store" },
      { value: "online", label: "Online" },
    ],
    onChange: (v) => setChannel(v as ReportChannel),
  };

  const listFilters: AdminListFilter[] = [];
  if (report.filters.store) listFilters.push(storeFilter);
  if (report.filters.channel) listFilters.push(channelFilter);
  return {
    stores,
    storeId,
    setStoreId,
    storeLabel,
    asOf,
    setAsOf,
    search,
    setSearch,
    debouncedSearch,
    periodLabel,
    dateFrom: dateRange.from,
    dateTo: dateRange.to,
    dateRangeValue: {
      preset: dateRange.preset,
      from: dateRange.from,
      to: dateRange.to,
    },
    setDateRange: dateRange.setDateRange,
    storeFilter,
    channel,
    channelFilter,
    listFilters,
  };
}
