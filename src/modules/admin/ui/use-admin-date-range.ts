"use client";

import { useCallback, useEffect, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";

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
  /** Read initial range from `period` search param (legacy lists). */
  legacyPeriodParam?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const defaultPreset = options?.defaultPreset ?? "today";
  const { value, setValue, setPageDefaultPreset, clearDateRange: clearGlobal } =
    useAdminDateRangeContext();

  useEffect(() => {
    setPageDefaultPreset(defaultPreset);
  }, [defaultPreset, pathname, setPageDefaultPreset]);

  useEffect(() => {
    if (options?.legacyPeriodParam) {
      const period = searchParams.get("period");
      if (period) {
        setValue(legacyPeriodToAdminDateRange(period));
        return;
      }
    }
    const from = searchParams.get("dateFrom") ?? "";
    const to = searchParams.get("dateTo") ?? "";
    if (from || to) {
      setValue({ preset: detectAdminDatePreset(from, to), from, to });
      return;
    }
    if (
      defaultPreset !== "all" &&
      value.preset === "all" &&
      !value.from &&
      !value.to
    ) {
      setValue(applyAdminDatePreset(defaultPreset));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync URL/defaults when route or params change
  }, [pathname, searchParams]);

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
