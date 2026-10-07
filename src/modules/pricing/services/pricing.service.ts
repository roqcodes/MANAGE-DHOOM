import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { computeFinalPrice } from "@/modules/pricing/pricing.compute";
import { resolveSuggestedPrice } from "@/modules/pricing/pricing.resolver";
import type { PricingRuleRow } from "@/modules/pricing/types";

export type { PricingRuleRow };

export interface VariantPricingSuggestion {
  variantId: string;
  variantName: string;
  listPrice: number;
  lowestVendorBase: number | null;
  suggestedPrice: number | null;
  centralStock: number;
}

export async function getActivePricingRuleForProduct(
  productId: string,
): Promise<PricingRuleRow | null> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("pricing_rules")
    .select("id,product_id,margin_percent,fixed_markup,is_active")
    .eq("product_id", productId)
    .eq("is_active", true)
    .maybeSingle();
  return data as PricingRuleRow | null;
}

/** Latest pricing rule row for a product (admin edit / detail). Not filtered by is_active. */
export async function getProductPricingRule(
  productId: string,
): Promise<PricingRuleRow | null> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("pricing_rules")
    .select("id,product_id,margin_percent,fixed_markup,is_active")
    .eq("product_id", productId)
    .maybeSingle();
  return data as PricingRuleRow | null;
}

export interface UpsertProductPricingRuleInput {
  margin_percent: number | null;
  fixed_markup: number | null;
  is_active: boolean;
}

export async function upsertProductPricingRule(
  productId: string,
  input: UpsertProductPricingRuleInput,
): Promise<void> {
  await requireAdminOrManagerProfile();

  let margin = input.margin_percent;
  let fixed = input.fixed_markup;

  if (margin != null && margin < 0) {
    throw new Error("Margin % must be ≥ 0.");
  }
  if (fixed != null && fixed < 0) {
    throw new Error("Fixed markup must be ≥ 0.");
  }

  if (
    margin != null &&
    Number.isFinite(margin) &&
    fixed != null &&
    Number.isFinite(fixed)
  ) {
    fixed = null;
  }

  const bothNull = margin == null && fixed == null;
  const is_active = bothNull ? false : input.is_active;

  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase
    .from("pricing_rules")
    .select("id")
    .eq("product_id", productId)
    .maybeSingle();

  const payload = {
    product_id: productId,
    margin_percent: bothNull ? null : margin,
    fixed_markup: bothNull ? null : fixed,
    is_active,
  };

  if (existing) {
    const { error } = await supabase
      .from("pricing_rules")
      .update({
        margin_percent: payload.margin_percent,
        fixed_markup: payload.fixed_markup,
        is_active: payload.is_active,
      })
      .eq("id", existing.id as string);
    if (error) throw new Error(error.message);
    return;
  }

  if (bothNull) return;

  const { error } = await supabase.from("pricing_rules").insert(payload);
  if (error) throw new Error(error.message);
}

export async function setProductSmartPricing(
  productId: string,
  enabled: boolean,
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("products")
    .update({ use_smart_pricing: enabled })
    .eq("id", productId);
  if (error) throw new Error(error.message);
}

/** Admin-only per-SKU suggestions (Mode B). Does not change customer prices. */
export async function getVariantPricingSuggestions(
  productId: string,
): Promise<VariantPricingSuggestion[]> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data: variants, error: variantRes } = await supabase
    .from("product_variants")
    .select("id,name,price")
    .eq("product_id", productId)
    .order("created_at", { ascending: true });

  if (variantRes) throw new Error(variantRes.message);

  const variantIds = (variants ?? []).map((v) => v.id as string);
  if (variantIds.length === 0) return [];

  const [rule, offersRes, invRes] = await Promise.all([
    getActivePricingRuleForProduct(productId),
    supabase
      .from("vendor_products")
      .select("variant_id,base_price,stock")
      .in("variant_id", variantIds)
      .gt("stock", 0),
    supabase.from("inventory").select("variant_id,stock").in("variant_id", variantIds),
  ]);

  if (offersRes.error) throw new Error(offersRes.error.message);
  if (invRes.error) throw new Error(invRes.error.message);

  const variantIdsSet = new Set(variantIds);

  const ruleInput =
    rule && rule.is_active
      ? { margin_percent: rule.margin_percent, fixed_markup: rule.fixed_markup }
      : null;

  const minBase = new Map<string, number>();
  for (const row of offersRes.data ?? []) {
    const vid = row.variant_id as string;
    if (!variantIdsSet.has(vid)) continue;
    const bp = Number(row.base_price ?? 0);
    if (!Number.isFinite(bp)) continue;
    const cur = minBase.get(vid);
    if (cur === undefined || bp < cur) minBase.set(vid, bp);
  }

  const stockMap = new Map<string, number>();
  for (const row of invRes.data ?? []) {
    const vid = row.variant_id as string;
    if (!variantIdsSet.has(vid)) continue;
    stockMap.set(
      vid,
      Math.max(0, Math.floor(Number((row as { stock?: number | null }).stock ?? 0))),
    );
  }

  return (variants ?? []).map((v) => {
    const vid = v.id as string;
    const lowestVendorBase = minBase.get(vid) ?? null;
    return {
      variantId: vid,
      variantName: (v.name as string | null) ?? "SKU",
      listPrice: Number(v.price ?? 0) || 0,
      lowestVendorBase,
      suggestedPrice: resolveSuggestedPrice(lowestVendorBase, ruleInput),
      centralStock: stockMap.get(vid) ?? 0,
    };
  });
}

/** Preview margin math for admin (sample base input). */
export function previewRuleOnBase(
  basePrice: number,
  rule: { margin_percent: number | null; fixed_markup: number | null } | null,
) {
  return computeFinalPrice(basePrice, rule);
}
