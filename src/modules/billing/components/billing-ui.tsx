"use client";

import { formatCurrencyAmount } from "@/lib/format-currency";

export function formatBillingInr(n: number) {
  return formatCurrencyAmount(n);
}

export function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100;
}
