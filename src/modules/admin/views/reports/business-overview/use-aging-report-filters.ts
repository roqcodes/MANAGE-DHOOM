"use client";

import { useMemo, useState } from "react";

import type { ReportDefinition } from "@/common/erp/report-types";
import { useDebouncedValue } from "@/modules/admin/ui";

import { resolveAgingAgeBoundsFromMinMax } from "./aging-age-filter-model";

/** Age (days) filter; no-op when `ageRange` / `expiredDaysRange` is off. */
export function useAgingReportAgeExtras(report: ReportDefinition) {
  const enabled = Boolean(report.filters.ageRange || report.filters.expiredDaysRange);
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");

  const debouncedMin = useDebouncedValue(ageMin, 300);
  const debouncedMax = useDebouncedValue(ageMax, 300);

  const bounds = useMemo(() => {
    if (!enabled) return { ageMinDays: undefined, ageMaxDays: undefined };
    return resolveAgingAgeBoundsFromMinMax(debouncedMin, debouncedMax);
  }, [debouncedMin, debouncedMax, enabled]);

  const setAgeMinMax = (min: string, max: string) => {
    setAgeMin(min);
    setAgeMax(max);
  };

  const clear = () => {
    setAgeMin("");
    setAgeMax("");
  };

  return {
    enabled,
    ageMin,
    ageMax,
    setAgeMin,
    setAgeMax,
    setAgeMinMax,
    clear,
    ageMinDays: bounds.ageMinDays,
    ageMaxDays: bounds.ageMaxDays,
  };
}
