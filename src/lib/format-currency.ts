export type CurrencySettings = {
  country_code: string;
  country_name: string;
  currency_code: string;
  currency_symbol: string;
  locale: string;
  show_mrp: boolean;
  capture_payments: boolean;
  /** ERP sales may drive store_product_inventory below zero when true. */
  allow_negative_store_stock: boolean;
};

export const DEFAULT_CURRENCY_SETTINGS: CurrencySettings = {
  country_code: "IN",
  country_name: "India",
  currency_code: "INR",
  currency_symbol: "₹",
  locale: "en-IN",
  show_mrp: true,
  capture_payments: true,
  allow_negative_store_stock: false,
};

/** Official Saudi Riyal sign (U+20C1). */
export const SAR_CURRENCY_SYMBOL = "\u20C1";

let activeSettings: CurrencySettings = { ...DEFAULT_CURRENCY_SETTINGS };

export function setCurrencySettings(settings: CurrencySettings) {
  activeSettings = { ...settings };
}

export function getCurrencySettings(): CurrencySettings {
  return activeSettings;
}

export function resolveCurrencySymbol(settings?: CurrencySettings): string {
  const s = settings ?? activeSettings;
  if (s.currency_code === "SAR") return SAR_CURRENCY_SYMBOL;
  return s.currency_symbol;
}

export function getCurrencySymbol(settings?: CurrencySettings): string {
  return resolveCurrencySymbol(settings);
}

/** Label helper, e.g. "Price (₹)" */
export function currencyLabel(prefix: string, settings?: CurrencySettings): string {
  return `${prefix} (${resolveCurrencySymbol(settings)})`;
}

function normalizeFractionDigits(
  options: Intl.NumberFormatOptions,
): Intl.NumberFormatOptions {
  const min = options.minimumFractionDigits;
  const max = options.maximumFractionDigits;
  if (min == null || max == null || min <= max) return options;
  return { ...options, minimumFractionDigits: max };
}

import { isSarCurrency } from "@/lib/currency-symbol";

export function formatCurrency(
  amount: number | null | undefined,
  options?: Intl.NumberFormatOptions,
  settings?: CurrencySettings,
): string {
  const s = settings ?? activeSettings;
  const num = formatCurrencyAmount(amount, options, s);
  if (num === "—") return num;
  if (isSarCurrency(s)) return `SAR ${num}`;
  return `${resolveCurrencySymbol(s)}${num}`;
}

/** Numeric amount only — use with symbol in column headers / KPI labels. */
export function formatCurrencyAmount(
  amount: number | null | undefined,
  options?: Intl.NumberFormatOptions,
  settings?: CurrencySettings,
): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  const s = settings ?? activeSettings;
  const fmt = normalizeFractionDigits({
    style: "decimal",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    numberingSystem: "latn",
    ...options,
  });
  return new Intl.NumberFormat(s.locale, fmt).format(amount);
}

/** Compact amounts for dashboards (e.g. $1.2K, ₹2.5L). */
export function formatCurrencyCompact(
  amount: number,
  settings?: CurrencySettings,
): string {
  const s = settings ?? activeSettings;
  const compact = formatCurrencyCompactAmount(amount, s);
  if (isSarCurrency(s)) return `SAR ${compact}`;
  return `${resolveCurrencySymbol(s)}${compact}`;
}

/** Compact numeric amount without currency symbol. */
export function formatCurrencyCompactAmount(
  amount: number,
  settings?: CurrencySettings,
): string {
  const locale = (settings ?? activeSettings).locale;
  if (amount >= 1e7) {
    return `${(amount / 1e7).toFixed(amount >= 1e8 ? 1 : 2)}Cr`;
  }
  if (amount >= 1e5) {
    return `${(amount / 1e5).toFixed(amount >= 1e6 ? 1 : 2)}L`;
  }
  if (amount >= 1e3) return `${(amount / 1e3).toFixed(1)}K`;
  return amount.toLocaleString(locale, {
    maximumFractionDigits: 0,
    numberingSystem: "latn",
  });
}

/** Backward-compatible alias — amount only (symbol in headers). */
export function formatInr(n: number, options?: Intl.NumberFormatOptions) {
  return formatCurrencyAmount(n, options);
}
