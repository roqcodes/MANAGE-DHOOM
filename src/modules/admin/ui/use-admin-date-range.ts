"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";

import {
  applyAdminDatePreset,
  type AdminDatePreset,
  type AdminDateRangeValue,
  adminDateRangeIsActive,
  detectAdminDatePreset,
  legacyPeriodToAdminDateRange,
} from "@/modules/admin/lib/admin-date-range";
import { useAdminDateRangeContext } from "@/modules/admin/providers/admin-date-range-provider";

export function useAdminDateRange(options?: {
  defaultPreset?: AdminDatePreset;
  /** Read range from `period` search param when present (legacy lists). */
  legacyPeriodParam?: boolean;
}) {
  const searchParams = useSearchParams();
  const defaultPreset = options?.defaultPreset ?? "today";
  const { value, setValue, setPageDefaultPreset, clearDateRange: clearGlobal } =
    useAdminDateRangeContext();

  useEffect(() => {
    setPageDefaultPreset(defaultPreset);
  }, [defaultPreset, setPageDefaultPreset]);

  /** Apply URL date params only when explicitly present (shared links / pagination). */
  useEffect(() => {
    if (options?.legacyPeriodParam) {
      const period = searchParams.get("period");
      if (period) {
        setValue(legacyPeriodToAdminDateRange(period));
        return;
      }
    }
    const from = searchParams.get("dateFrom");
    const to = searchParams.get("dateTo");
    if (from != null || to != null) {
      const fromStr = from ?? "";
      const toStr = to ?? "";
      if (fromStr || toStr) {
        setValue({ preset: detectAdminDatePreset(fromStr, toStr), from: fromStr, to: toStr });
      }
    }
  }, [searchParams, options?.legacyPeriodParam, setValue]);

  const setPreset = useCallback(
    (preset: AdminDatePreset) => {
      setValue(applyAdminDatePreset(preset));
    },
    [setValue],
  );

  const setRange = useCallback(
    (from: string, to: string) => {
      setValue({
        preset: detectAdminDatePreset(from, to),
        from,
        to,
      });
    },
    [setValue],
  );

  const setDateRange = useCallback(
    (next: AdminDateRangeValue) => {
      setValue(next);
    },
    [setValue],
  );

  const clearDateRange = useCallback(() => {
    clearGlobal();
  }, [clearGlobal]);

  const listParams = useMemo(() => {
    const params: Record<string, string> = {};
    if (value.from) params.dateFrom = value.from;
    if (value.to) params.dateTo = value.to;
    return params;
  }, [value.from, value.to]);

  const isDateFiltering = adminDateRangeIsActive(value);

  return {
    ...value,
    datePreset: value.preset,
    setPreset,
    setRange,
    setDateRange,
    clearDateRange,
    listParams,
    isDateFiltering,
  };
}
