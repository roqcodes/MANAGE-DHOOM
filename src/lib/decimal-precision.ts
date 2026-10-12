/**
 * ERP money/qty precision: 4 decimal places in calculations; up to 3 decimals on display
 * (trailing zeros omitted — 2.1 not 2.100, but 2.001 kept).
 */

/** Internal math, storage, and RPC-aligned rounding. */
export const CALC_DECIMAL_PLACES = 4;

/** Max fraction digits for important displayed amounts (currency, costs, rates). */
export const DISPLAY_DECIMAL_PLACES = 3;

/** Balance / tolerance checks on 4dp totals. */
export const CALC_BALANCE_TOLERANCE = 0.0001;

function roundToPlaces(n: number, places: number): number {
  if (!Number.isFinite(n)) return 0;
  const factor = 10 ** places;
  return Math.round(n * factor) / factor;
}

export function roundCalc(n: number): number {
  return roundToPlaces(n, CALC_DECIMAL_PLACES);
}

/** @alias roundCalc — monetary and line amounts in app logic. */
export function roundMoney(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return roundCalc(n);
}

/** Round for display (max 3dp) after calc precision. */
export function roundForDisplay(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return roundToPlaces(roundCalc(n), DISPLAY_DECIMAL_PLACES);
}

/** Plain string for inputs / tables: trims trailing zeros (e.g. 2.1, 2.001). */
export function formatDisplayDecimal(
  amount: number | null | undefined,
  maxFractionDigits: number = DISPLAY_DECIMAL_PLACES,
): string {
  if (amount == null || !Number.isFinite(amount)) return "";
  const v = roundToPlaces(roundCalc(amount), maxFractionDigits);
  if (v === 0) return "0";
  const fixed = v.toFixed(maxFractionDigits);
  const trimmed = fixed.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
  return trimmed;
}
