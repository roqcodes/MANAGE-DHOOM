"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { useDebouncedValue } from "@/modules/admin/ui/use-debounced-value";
import { useErpStores } from "@/modules/erp/components/use-erp-stores";

export function useErpListState(options?: {
  defaultStatus?: string;
  /** When true, allow clearing store filter to show all stores (default false). */
  allowAllStores?: boolean;
}) {
  const searchParams = useSearchParams();
  const { activeStoreId, loading: erpContextLoading } = useErpStores();
  const allowAllStores = options?.allowAllStores ?? false;

  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [status, setStatus] = useState(
    searchParams.get("status") ?? options?.defaultStatus ?? "all",
  );
  const [storeId, setStoreId] = useState(
    searchParams.get("storeId") ?? activeStoreId ?? "",
  );
  const [dateFrom, setDateFrom] = useState(searchParams.get("dateFrom") ?? "");
  const [dateTo, setDateTo] = useState(searchParams.get("dateTo") ?? "");
  const debouncedSearch = useDebouncedValue(search, 350);
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));

  useEffect(() => {
    if (activeStoreId) {
      setStoreId(activeStoreId);
    }
  }, [activeStoreId]);

  const effectiveStoreId =
    allowAllStores && !storeId ? "" : storeId || activeStoreId;

  const listParams = useMemo(() => {
    const params: Record<string, string> = {};
    if (status !== "all") params.status = status;
    if (effectiveStoreId) params.storeId = effectiveStoreId;
    if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo) params.dateTo = dateTo;
    return params;
  }, [status, effectiveStoreId, debouncedSearch, dateFrom, dateTo]);

  const isFiltering =
    Boolean(debouncedSearch.trim()) ||
    status !== "all" ||
    Boolean(dateFrom) ||
    Boolean(dateTo) ||
    (allowAllStores && Boolean(storeId) && storeId !== activeStoreId);

  function clearFilters() {
    setSearch("");
    setStatus(options?.defaultStatus ?? "all");
    setStoreId(activeStoreId ?? "");
    setDateFrom("");
    setDateTo("");
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
    setDateFrom,
    dateTo,
    setDateTo,
    page,
    listParams,
    isFiltering,
    clearFilters,
    activeStoreId,
    allowAllStores,
    erpContextLoading,
  };
}
