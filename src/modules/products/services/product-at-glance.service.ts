import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type { ProductAtGlanceMetrics } from "@/common/admin/types";
import {
  getActivePricingRuleForProduct,
  type PricingRuleRow,
} from "@/modules/pricing/services/pricing.service";
import {
  resolveListPrice,
  resolveSuggestedPrice,
} from "@/modules/pricing/pricing.resolver";

export type { ProductAtGlanceMetrics };

/**
 * Product summary: central stock + list prices (customer-facing).
 * When smart pricing is on, also returns admin-only suggested prices from vendor cost + rules.
 */
export async function getProductAtGlanceMetrics(
  productId: string,
  variantIds: string[],
  useSmartPricing: boolean,
  productLevel?: { price?: number | null; mrp?: number | null },
  pricingRule?: PricingRuleRow | null,
): Promise<ProductAtGlanceMetrics> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const empty: ProductAtGlanceMetrics = {
    centralStockTotal: 0,
    listPriceMin: null,
    listPriceMax: null,
    variantsInStock: 0,
    suggestedPriceMin: null,
    suggestedPriceMax: null,
    variantsWithSuggestion: 0,
    vendorCount: 0,
    vendorStockTotal: 0,
  };

  if (variantIds.length === 0) {
    const listPrice = resolveListPrice(productLevel?.price ?? null);
    return {
      ...empty,
      listPriceMin: listPrice > 0 ? listPrice : null,
      listPriceMax: listPrice > 0 ? listPrice : null,
    };
  }

  const rulePromise = !useSmartPricing
    ? Promise.resolve(null)
    : pricingRule !== undefined
      ? Promise.resolve(pricingRule?.is_active ? pricingRule : null)
      : getActivePricingRuleForProduct(productId);

  const [rule, invRes, variantRes, offersRes] = await Promise.all([
    rulePromise,
    supabase.from("inventory").select("variant_id,stock").in("variant_id", variantIds),
    supabase.from("product_variants").select("id,price").in("id", variantIds),
    supabase
      .from("vendor_products")
      .select("vendor_id,variant_id,base_price,stock")
      .in("variant_id", variantIds),
  ]);

  if (invRes.error) throw new Error(invRes.error.message);
  if (variantRes.error) throw new Error(variantRes.error.message);
  if (offersRes.error) throw new Error(offersRes.error.message);

  const stockByVariant = new Map<string, number>();
  for (const r of invRes.data ?? []) {
    const vid = r.variant_id as string;
    stockByVariant.set(
      vid,
      Math.max(0, Math.floor(Number((r as { stock?: number | null }).stock ?? 0))),
    );
  }

  let centralStockTotal = 0;
  for (const stock of stockByVariant.values()) {
    centralStockTotal += stock;
  }

  const ruleInput =
    rule && rule.is_active
      ? { margin_percent: rule.margin_percent, fixed_markup: rule.fixed_markup }
      : null;

  const minBaseByVariant = new Map<string, number>();
  const vendorsWithStock = new Set<string>();
  let vendorStockTotal = 0;

  for (const row of offersRes.data ?? []) {
    const vid = row.variant_id as string;
    const stock = Math.max(0, Math.floor(Number(row.stock ?? 0)));
    vendorStockTotal += stock;

    const vendorId = row.vendor_id as string;
    if (stock > 0 && vendorId) vendorsWithStock.add(vendorId);

    if (!useSmartPricing) continue;

    const bp = Number(row.base_price ?? 0);
    if (!Number.isFinite(bp) || stock <= 0) continue;
    const cur = minBaseByVariant.get(vid);
    if (cur === undefined || bp < cur) minBaseByVariant.set(vid, bp);
  }

  const listPricesInStock: number[] = [];
  const suggestedPrices: number[] = [];

  for (const v of variantRes.data ?? []) {
    const vid = v.id as string;
    const stock = stockByVariant.get(vid) ?? 0;
    if (stock <= 0) continue;

    const listPrice = resolveListPrice(v.price as number | null);
    if (listPrice > 0) listPricesInStock.push(listPrice);

    if (useSmartPricing) {
      const suggested = resolveSuggestedPrice(
        minBaseByVariant.get(vid) ?? null,
        ruleInput,
      );
      if (suggested != null && suggested > 0) suggestedPrices.push(suggested);
    }
  }

  return {
    centralStockTotal,
    listPriceMin:
      listPricesInStock.length > 0 ? Math.min(...listPricesInStock) : null,
    listPriceMax:
      listPricesInStock.length > 0 ? Math.max(...listPricesInStock) : null,
    variantsInStock: listPricesInStock.length,
    suggestedPriceMin:
      suggestedPrices.length > 0 ? Math.min(...suggestedPrices) : null,
    suggestedPriceMax:
      suggestedPrices.length > 0 ? Math.max(...suggestedPrices) : null,
    variantsWithSuggestion: suggestedPrices.length,
    vendorCount: vendorsWithStock.size,
    vendorStockTotal,
  };
}
