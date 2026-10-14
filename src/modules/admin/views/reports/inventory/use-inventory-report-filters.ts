"use client";

import { useEffect, useState } from "react";

import type { ReportDefinition, ReportStockLevel } from "@/common/erp/report-types";
import type { AdminListFilter } from "@/modules/admin/ui";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { useBusinessReportFilters } from "../business-overview/use-business-report-filters";

const STOCK_LEVEL_OPTIONS: { value: ReportStockLevel; label: string }[] = [
  { value: "all", label: "All levels" },
  { value: "in_stock", label: "In stock" },
  { value: "low_stock", label: "Low stock" },
  { value: "out_of_stock", label: "Out of stock" },
];

const TRANSFER_STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "completed", label: "Completed" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

export function useInventoryReportFilters(report: ReportDefinition) {
  const base = useBusinessReportFilters(report);
  const [brandId, setBrandId] = useState("all");
  const [categoryId, setCategoryId] = useState("all");
  const [stockLevel, setStockLevel] = useState<ReportStockLevel>("in_stock");
  const [fromStoreId, setFromStoreId] = useState("all");
  const [toStoreId, setToStoreId] = useState("all");
  const [transferStatus, setTransferStatus] = useState("all");
  const [brandOptions, setBrandOptions] = useState<{ value: string; label: string }[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    if (!report.filters.brand && !report.filters.category) return;
    adminGet<{ brands: { id: string; name: string }[] }>("brands")
      .then((res) => {
        setBrandOptions((res.brands ?? []).map((b) => ({ value: b.id, label: b.name })));
      })
      .catch(() => setBrandOptions([]));
    adminGet<{ categories: { id: string; name: string }[] }>("categories")
      .then((res) => {
        setCategoryOptions((res.categories ?? []).map((c) => ({ value: c.id, label: c.name })));
      })
      .catch(() => setCategoryOptions([]));
  }, [report.filters.brand, report.filters.category]);

  const storeOptions = [
    { value: "all", label: "All stores" },
    ...base.stores.map((s) => ({ value: s.id, label: s.name })),
  ];

  const extraFilters: AdminListFilter[] = [];
  if (report.filters.stockLevel) {
    extraFilters.push({
      id: "stockLevel",
      label: "Stock level",
      value: stockLevel,
      options: STOCK_LEVEL_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
      onChange: (v) => setStockLevel(v as ReportStockLevel),
    });
  }
  if (report.filters.brand) {
    extraFilters.push({
      id: "brand",
      label: "Brand",
      value: brandId,
      options: [{ value: "all", label: "All brands" }, ...brandOptions],
      onChange: setBrandId,
    });
  }
  if (report.filters.category) {
    extraFilters.push({
      id: "category",
      label: "Category",
      value: categoryId,
      options: [{ value: "all", label: "All categories" }, ...categoryOptions],
      onChange: setCategoryId,
    });
  }
  if (report.filters.fromStore) {
    extraFilters.push({
      id: "fromStore",
      label: "From store",
      value: fromStoreId,
      options: storeOptions,
      onChange: setFromStoreId,
    });
  }
  if (report.filters.toStore) {
    extraFilters.push({
      id: "toStore",
      label: "To store",
      value: toStoreId,
      options: storeOptions,
      onChange: setToStoreId,
    });
  }
  if (report.filters.status) {
    extraFilters.push({
      id: "status",
      label: "Status",
      value: transferStatus,
      options: TRANSFER_STATUS_OPTIONS,
      onChange: setTransferStatus,
    });
  }

  return {
    ...base,
    listFilters: [...base.listFilters, ...extraFilters],
    brandId: brandId === "all" ? "" : brandId,
    categoryId: categoryId === "all" ? "" : categoryId,
    stockLevel,
    fromStoreId: fromStoreId === "all" ? "" : fromStoreId,
    toStoreId: toStoreId === "all" ? "" : toStoreId,
    transferStatus,
  };
}
