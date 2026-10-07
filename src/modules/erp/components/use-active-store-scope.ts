"use client";

import { useEffect, useMemo, useState } from "react";

import { useErpStores } from "@/modules/erp/components/use-erp-stores";

/**
 * Keeps list/filter state aligned with the header store switcher.
 * Defaults to the active store and re-syncs when it changes.
 */
export function useActiveStoreScope(options?: { allowAll?: boolean }) {
  const { activeStoreId, loading: erpContextLoading } = useErpStores();
  const allowAll = options?.allowAll ?? false;
  const [storeId, setStoreId] = useState(activeStoreId);

  useEffect(() => {
    if (activeStoreId) {
      setStoreId(activeStoreId);
    }
  }, [activeStoreId]);

  const effectiveStoreId = allowAll && !storeId ? "" : storeId || activeStoreId;

  const listParams = useMemo(() => {
    const params: Record<string, string> = {};
    if (effectiveStoreId) params.storeId = effectiveStoreId;
    return params;
  }, [effectiveStoreId]);

  return {
    activeStoreId,
    storeId: effectiveStoreId,
    setStoreId,
    listParams,
    erpContextLoading,
  };
}
