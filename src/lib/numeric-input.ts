/**
 * Controlled `<input type="number">` helpers.
 * Avoid `parseFloat(x) || 0` on change — that forces "0" when the user clears the field.
 */

/** Parse user input; returns `NaN` when the field is empty or incomplete. */
export function parseNumberInputValue(raw: string): number {
  const trimmed = raw.trim();
  if (
    trimmed === "" ||
    trimmed === "-" ||
    trimmed === "." ||
    trimmed === "-." ||
    trimmed === "+"
  ) {
    return Number.NaN;
  }
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : Number.NaN;
}

/** Value for a controlled number input (`""` when empty / NaN). */
export function formatNumberInputValue(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "";
  return String(value);
}

/** Use in totals, API payloads, and math when state may hold `NaN` for an empty field. */
export function coalesceNumber(value: number | null | undefined, fallback = 0): number {
  if (value == null || Number.isNaN(value)) return fallback;
  return value;
}
