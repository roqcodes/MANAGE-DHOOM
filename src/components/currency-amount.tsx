"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { CurrencySymbolMark } from "@/components/currency-symbol-mark";
import {
  formatCurrencyAmount,
  formatCurrencyCompactAmount,
  resolveCurrencySymbol,
  type CurrencySettings,
} from "@/lib/format-currency";
import { isSarCurrency } from "@/lib/currency-symbol";
import { useCurrencySettings } from "@/modules/settings/providers/currency-settings-provider";

const SYMBOL_CLASS =
  "text-[0.92em] font-medium leading-none align-baseline opacity-80";

export function CurrencyAmount({
  amount,
  options,
  compact,
  settings,
  className,
  symbolClassName = SYMBOL_CLASS,
  showSymbol = true,
  fallback = "—",
}: {
  amount: number | null | undefined;
  options?: Intl.NumberFormatOptions;
  compact?: boolean;
  settings?: CurrencySettings;
  className?: string;
  symbolClassName?: string;
  /** When false, only the numeric amount is shown (for tables with symbol in header). */
  showSymbol?: boolean;
  fallback?: ReactNode;
}) {
  const currency = useCurrencySettings();
  const resolved = settings ?? currency.settings;

  if (amount == null || !Number.isFinite(amount)) {
    return <span className={className}>{fallback}</span>;
  }

  const formatted = compact
    ? formatCurrencyCompactAmount(amount, resolved)
    : formatCurrencyAmount(amount, options, resolved);

  if (!showSymbol) {
    return <span className={cn("tabular-nums", className)}>{formatted}</span>;
  }

  if (isSarCurrency(resolved)) {
    return (
      <span className={cn("inline-flex items-baseline gap-0.5 tabular-nums", className)}>
        <CurrencySymbolMark settings={resolved} imageClassName="h-[1.05em] w-[1.05em]" />
        {formatted}
      </span>
    );
  }

  const symbol = resolveCurrencySymbol(resolved);
  return (
    <span className={cn("tabular-nums", className)}>
      <span className={symbolClassName}>{symbol}</span>
      {formatted}
    </span>
  );
}
