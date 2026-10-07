/**
 * Customer-facing unit price from vendor cost + catalog pricing rules (admin assist only).
 * Customer checkout uses SKU list price — this function is for margin suggestions.
 */
import type { FinalPriceBreakdown, PricingRuleInput } from "@/modules/pricing/types";

export function computeFinalPrice(
  base_price: number,
  rule: PricingRuleInput | null,
): FinalPriceBreakdown {
  const base = Number(base_price);
  if (!Number.isFinite(base)) {
    return { base_price: 0, margin_amount: 0, final_price: 0 };
  }

  let final_price = base;

  if (
    rule?.margin_percent != null &&
    Number.isFinite(Number(rule.margin_percent))
  ) {
    final_price = base * (1 + Number(rule.margin_percent) / 100);
  } else if (
    rule?.fixed_markup != null &&
    Number.isFinite(Number(rule.fixed_markup))
  ) {
    final_price = base + Number(rule.fixed_markup);
  }

  if (final_price < base) {
    final_price = base;
  }

  return {
    base_price: base,
    margin_amount: final_price - base,
    final_price,
  };
}
