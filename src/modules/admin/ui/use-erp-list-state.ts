"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import type { AdminDatePreset } from "@/modules/admin/lib/admin-date-range";
import { useAdminDateRange } from "@/modules/admin/ui/use-admin-date-range";
import { useDebouncedValue } from "@/modules/admin/ui/use-debounced-value";
import { useErpStores } from "@/modules/erp/components/use-erp-stores";
import { useAddressHierarchyFilters } from "@/modules/customers/hooks/use-address-hierarchy-filters";

export function useErpListState(options?: {
  defaultStatus?: string;
  /** When true, allow clearing store filter to show all stores (default false). */
  allowAllStores?: boolean;
  defaultDatePreset?: AdminDatePreset;
}) {
  const searchParams = useSearchParams();
  const { activeStoreId, loading: erpContextLoading } = useErpStores();
  const allowAllStores = options?.allowAllStores ?? false;

  const {
    from: dateFrom,
    to: dateTo,
    listParams: dateListParams,
    isDateFiltering,
    clearDateRange,
  } = useAdminDateRange({ defaultPreset: options?.defaultDatePreset ?? "today" });

  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [status, setStatus] = useState(
    searchParams.get("status") ?? options?.defaultStatus ?? "all",
  );
  const [storeId, setStoreId] = useState(
    searchParams.get("storeId") ?? activeStoreId ?? "",
  );

  const debouncedSearch = useDebouncedValue(search, 350);
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const address = useAddressHierarchyFilters({
    initial: {
      cityId: searchParams.get("cityId"),
      streetId: searchParams.get("streetId"),
      mallId: searchParams.get("mallId"),
    },
  });

  useEffect(() => {
    if (activeStoreId) {
      setStoreId(activeStoreId);
    }
  }, [activeStoreId]);

  const effectiveStoreId =
    allowAllStores && !storeId ? "" : storeId || activeStoreId;

  const listParams = useMemo(() => {
    const params: Record<string, string> = { ...dateListParams };
    if (status !== "all") params.status = status;
    if (effectiveStoreId) params.storeId = effectiveStoreId;
    if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
    Object.assign(params, address.listParams);
    return params;
  }, [status, effectiveStoreId, debouncedSearch, dateListParams, address.listParams]);

  const isFiltering =
    Boolean(debouncedSearch.trim()) ||
    status !== "all" ||
    isDateFiltering ||
    address.isAddressFiltering ||
    (allowAllStores && Boolean(storeId) && storeId !== activeStoreId);

  function clearFilters() {
    setSearch("");
    setStatus(options?.defaultStatus ?? "all");
    setStoreId(activeStoreId ?? "");
    clearDateRange();
    address.clearAddressFilters();
  }

  return {
    search,
    setSearch,
    debouncedSearch,
    status,
    setStatus,
    storeId: effectiveStoreId,
    setStoreId,
    dateFrom,
    dateTo,
    page,
    listParams,
    isFiltering,
    isDateFiltering,
    clearFilters,
    activeStoreId,
    allowAllStores,
    erpContextLoading,
    addressFilterFields: address.toolbarProps,
  };
}
