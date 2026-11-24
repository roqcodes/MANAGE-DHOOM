import { isSarCurrency } from "@/lib/currency-symbol";
import { formatCurrency, formatCurrencyAmount, getCurrencySettings } from "@/lib/format-currency";
import { formatDateOnly } from "@/lib/format-date";

/** DD/MM/YYYY — matches sample tax invoice. */
export function formatInvoiceDate(iso: string | null | undefined): string {
  const ymd = formatDateOnly(iso, "");
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

export function formatInvoiceMoney(
  amount: number | null | undefined,
  fractionDigits = 2,
): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  const opts = {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  };
  const num = formatCurrencyAmount(amount, opts);
  if (isSarCurrency()) return `${num} SAR`;
  return formatCurrency(amount, opts);
}

/** Unit prices on the sample invoice use 3 decimal places. */
export function formatInvoiceUnitPrice(amount: number | null | undefined): string {
  return formatInvoiceMoney(amount, 3);
}

export function formatQty(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat(getCurrencySettings().locale, {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
    numberingSystem: "latn",
  }).format(n);
}
