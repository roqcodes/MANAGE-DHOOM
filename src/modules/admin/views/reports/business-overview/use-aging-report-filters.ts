"use client";

import { useMemo, useState } from "react";

import type { ReportDefinition } from "@/common/erp/report-types";
import { useDebouncedValue } from "@/modules/admin/ui";

function parseAgeDaysInput(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

/** Age (days past due) filter; safe to call on every report — no-op when `ageRange` is off. */
export function useAgingReportAgeExtras(report: ReportDefinition) {
  const enabled = Boolean(report.filters.ageRange);
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const debouncedAgeMin = useDebouncedValue(ageMin, 300);
  const debouncedAgeMax = useDebouncedValue(ageMax, 300);

  const ageMinDays = useMemo(() => {
    if (!enabled) return undefined;
    return parseAgeDaysInput(debouncedAgeMin);
  }, [debouncedAgeMin, enabled]);

  const ageMaxDays = useMemo(() => {
    if (!enabled) return undefined;
    return parseAgeDaysInput(debouncedAgeMax);
  }, [debouncedAgeMax, enabled]);

  const normalizedAge = useMemo(() => {
    if (!enabled) return { ageMinDays: undefined, ageMaxDays: undefined };
    if (ageMinDays == null || ageMaxDays == null) {
      return { ageMinDays, ageMaxDays };
    }
    if (ageMinDays > ageMaxDays) {
      return { ageMinDays: ageMaxDays, ageMaxDays: ageMinDays };
    }
    return { ageMinDays, ageMaxDays };
  }, [ageMinDays, ageMaxDays, enabled]);

  return {
    enabled,
    ageMin,
    ageMax,
    setAgeMin,
    setAgeMax,
    ageMinDays: normalizedAge.ageMinDays,
    ageMaxDays: normalizedAge.ageMaxDays,
  };
}
