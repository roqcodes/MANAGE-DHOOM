export function parseAgingAgeDaysInput(raw?: string | null): number | undefined {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return undefined;
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

/** Inclusive RPC bounds: age_days >= min, age_days <= max. */
export function resolveAgingAgeBoundsFromMinMax(
  minRaw: string,
  maxRaw: string,
): { ageMinDays?: number; ageMaxDays?: number } {
  const min = parseAgingAgeDaysInput(minRaw);
  const max = parseAgingAgeDaysInput(maxRaw);
  if (min != null && max != null && min > max) {
    return { ageMinDays: max, ageMaxDays: min };
  }
  return { ageMinDays: min, ageMaxDays: max };
}

export function isAgingMinMaxFilterActive(minRaw: string, maxRaw: string): boolean {
  const { ageMinDays, ageMaxDays } = resolveAgingAgeBoundsFromMinMax(minRaw, maxRaw);
  return ageMinDays != null || ageMaxDays != null;
}
