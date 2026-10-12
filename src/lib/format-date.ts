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

/** Add calendar days to a YYYY-MM-DD value (noon local parse avoids DST edge cases). */
export function addDaysToDateInput(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Add calendar months to a YYYY-MM-DD value. */
export function addMonthsToDateInput(isoDate: string, months: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

/** Default due date offset when creating a sales invoice. */
export const DEFAULT_INVOICE_DUE_MONTHS = 2;

/** Default line-item expiry offset on purchase bills (from bill date). */
export const DEFAULT_ITEM_EXPIRY_MONTHS = 2;

/** YYYY-MM-DD expiry for inventory lines: document date + DEFAULT_ITEM_EXPIRY_MONTHS. */
export function itemExpiryFromDocumentDate(documentDate: string | null | undefined): string {
  const base =
    toDateInputValue(documentDate) || new Date().toISOString().slice(0, 10);
  return addMonthsToDateInput(base, DEFAULT_ITEM_EXPIRY_MONTHS);
}

/** Compact display for ERP date-only fields (YYYY-MM-DD). */
export function formatDateOnly(
  value: string | null | undefined,
  fallback = "—",
): string {
  const normalized = toDateInputValue(value);
  return normalized || fallback;
}
