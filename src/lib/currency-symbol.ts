import type { CurrencySettings } from "@/lib/format-currency";
import { getCurrencySettings } from "@/lib/format-currency";

export const SAR_SYMBOL_IMAGE_PATH = "/images/sar-currency-symbol.svg";

export function isSarCurrency(settings?: CurrencySettings): boolean {
  const s = settings ?? getCurrencySettings();
  return s.currency_code === "SAR";
}
