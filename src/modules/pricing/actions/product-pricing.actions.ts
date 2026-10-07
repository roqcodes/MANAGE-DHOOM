"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  getVariantPricingSuggestions,
  setProductSmartPricing,
  upsertProductPricingRule,
} from "@/modules/pricing/services/pricing.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";

const upsertSchema = z.object({
  productId: z.string().uuid(),
  marginPercent: z.number().min(0).nullable(),
  fixedMarkup: z.number().min(0).nullable(),
  isActive: z.boolean(),
});

export async function upsertProductPricingRuleAction(
  input: z.infer<typeof upsertSchema>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.flatten().formErrors[0] ?? "Invalid input.",
    };
  }

  try {
    await upsertProductPricingRule(parsed.data.productId, {
      margin_percent: parsed.data.marginPercent,
      fixed_markup: parsed.data.fixedMarkup,
      is_active: parsed.data.isActive,
    });
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Save failed.",
    };
  }

  revalidatePath(`/admin/products/${parsed.data.productId}`);
  return { ok: true };
}

export async function setProductSmartPricingAction(
  productId: string,
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await setProductSmartPricing(productId, enabled);
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Update failed.",
    };
  }
  revalidatePath(`/admin/products/${productId}`);
  return { ok: true };
}

export async function fetchVariantPricingSuggestionsAction(productId: string) {
  await requireAdminOrManagerProfile();
  return getVariantPricingSuggestions(productId);
}

export async function applySuggestedPricesAction(
  productId: string,
): Promise<{ ok: true; updated: number } | { ok: false; message: string }> {
  try {
    await requireAdminOrManagerProfile();
    const suggestions = await getVariantPricingSuggestions(productId);
    const toApply = suggestions.filter(
      (s) => s.suggestedPrice != null && s.suggestedPrice > 0,
    );
    if (toApply.length === 0) {
      return { ok: false, message: "No suggestions available. Add vendor offers and pricing rules first." };
    }

    const supabase = await createSupabaseServerClient();
    let updated = 0;
    for (const row of toApply) {
      const { error } = await supabase
        .from("product_variants")
        .update({ price: row.suggestedPrice })
        .eq("id", row.variantId);
      if (error) throw new Error(error.message);
      updated += 1;
    }

    revalidatePath(`/admin/products/${productId}`);
    return { ok: true, updated };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Apply failed.",
    };
  }
}
