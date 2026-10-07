/** DB row shape for `pricing_rules` (admin + services). */
export interface PricingRuleRow {
  id: string;
  product_id: string | null;
  margin_percent: number | null;
  fixed_markup: number | null;
  is_active: boolean | null;
}

export interface PricingRuleInput {
  margin_percent: number | null;
  fixed_markup: number | null;
}

export interface FinalPriceBreakdown {
  base_price: number;
  margin_amount: number;
  final_price: number;
}
