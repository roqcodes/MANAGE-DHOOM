/**
 * Controlled `<input type="number">` helpers.
 * Avoid `parseFloat(x) || 0` on change — that forces "0" when the user clears the field.
 */

import {
  CALC_DECIMAL_PLACES,
  DISPLAY_DECIMAL_PLACES,
  formatDisplayDecimal,
  roundCalc,
} from "@/lib/decimal-precision";

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

export function roundToDecimalPlaces(n: number, places: number): number {
  if (!Number.isFinite(n)) return n;
  const factor = 10 ** places;
  return Math.round(n * factor) / factor;
}

/** Default places for money/qty fields on blur (ERP calc precision). */
export const DEFAULT_MONEY_FRACTION_DIGITS = CALC_DECIMAL_PLACES;

/** Value for a controlled number input (`""` when empty / NaN). */
export function formatNumberInputValue(
  value: number | null | undefined,
  fractionDigits?: number,
): string {
  if (value == null || Number.isNaN(value)) return "";
  if (fractionDigits == null) return String(value);
  const rounded = roundCalc(roundToDecimalPlaces(value, fractionDigits));
  if (rounded === 0) return "";
  const displayPlaces = Math.min(fractionDigits, DISPLAY_DECIMAL_PLACES);
  return formatDisplayDecimal(rounded, displayPlaces);
}

/** Use in totals, API payloads, and math when state may hold `NaN` for an empty field. */
export function coalesceNumber(value: number | null | undefined, fallback = 0): number {
  if (value == null || Number.isNaN(value)) return fallback;
  return value;
}
