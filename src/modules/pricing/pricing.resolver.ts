import { computeFinalPrice } from "@/modules/pricing/pricing.compute";
import type { PricingRuleInput } from "@/modules/pricing/types";

export function roundMoney2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/** Customer-facing unit price — always the SKU list price (Mode A). */
export function resolveListPrice(listPrice: number | null | undefined): number {
  return roundMoney2(Number(listPrice) || 0);
}

/**
 * Admin-only suggested sell price from lowest vendor base + product rule (Mode B assist).
 * Does not affect customer checkout.
 */
export function resolveSuggestedPrice(
  lowestVendorBase: number | null,
  rule: PricingRuleInput | null,
): number | null {
  if (lowestVendorBase == null || !Number.isFinite(lowestVendorBase)) {
    return null;
  }
  const breakdown = computeFinalPrice(lowestVendorBase, rule);
  return roundMoney2(breakdown.final_price);
}

/** Reference cost for margin reporting on orders (lowest vendor base, not customer price). */
export function resolveReferenceCost(lowestVendorBase: number | null): number {
  if (lowestVendorBase == null || !Number.isFinite(lowestVendorBase)) {
    return 0;
  }
  return roundMoney2(lowestVendorBase);
}

export function computeOrderMargin(
  finalPrice: number,
  referenceCost: number,
): number {
  return roundMoney2(finalPrice - referenceCost);
}
