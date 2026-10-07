/** Normalize DB date/timestamptz values to YYYY-MM-DD for inputs and compact display. */
export function toDateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const datePrefix = trimmed.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePrefix)) return datePrefix;

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return trimmed;
}

/** Compact display for ERP date-only fields (YYYY-MM-DD). */
export function formatDateOnly(
  value: string | null | undefined,
  fallback = "—",
): string {
  const normalized = toDateInputValue(value);
  return normalized || fallback;
}
