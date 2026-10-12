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

export type ErpListActivityTimestamps = {
  created_at?: string | null;
  updated_at?: string | null;
};

/** Prefer updated_at for “last activity” time on list rows. */
export function erpActivityTimestamp(
  row?: ErpListActivityTimestamps | null,
): string | null {
  if (!row) return null;
  const raw = row.updated_at ?? row.created_at;
  if (!raw?.trim()) return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : raw;
}

function parseTimestampMs(value: string | null | undefined): number | null {
  if (!value?.trim()) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

/**
 * Lexicographic sort key: document date, then last-updated/created time.
 * Use with useSortableData string comparison (asc/desc).
 */
export function erpDocumentDateSortKey(
  documentDate: string | null | undefined,
  row?: ErpListActivityTimestamps | null,
): string {
  const datePart = toDateInputValue(documentDate) || "0000-00-00";
  const activity = erpActivityTimestamp(row);
  const iso =
    activity && parseTimestampMs(activity) != null
      ? new Date(activity).toISOString()
      : `${datePart}T00:00:00.000Z`;
  return `${datePart}|${iso}`;
}

/** Full instant sort key for created_at / updated_at columns. */
export function erpInstantSortKey(value: string | null | undefined): string {
  const ms = parseTimestampMs(value);
  return ms != null ? new Date(ms).toISOString() : "0000-00-00T00:00:00.000Z";
}

const LIST_TIME_FORMAT: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  minute: "2-digit",
};

/** Local time label for an ISO / timestamptz value. */
export function formatTimeLocal(
  value: string | null | undefined,
): string | null {
  const ms = parseTimestampMs(value);
  if (ms == null) return null;
  return new Intl.DateTimeFormat(undefined, LIST_TIME_FORMAT).format(new Date(ms));
}

/** Compact list date (dd-MMM-yyyy) from a document date or timestamp. */
export function formatListDateLabel(
  documentDate: string | null | undefined,
): string {
  const normalized = toDateInputValue(documentDate);
  if (!normalized) return "—";
  const d = new Date(`${normalized}T12:00:00`);
  if (Number.isNaN(d.getTime())) return normalized;
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}
