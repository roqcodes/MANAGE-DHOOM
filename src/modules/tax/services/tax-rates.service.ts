import "server-only";

import { unstable_cache } from "next/cache";

import {
  PUBLIC_TAX_RATES_CACHE_TAG,
  revalidatePublicTaxRates,
} from "@/lib/cache/public-catalog-cache";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type { Database } from "@/lib/integrations/supabase/types";
import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";

export interface TaxRateRow {
  id: string;
  name: string;
  rate_percent: number;
  description: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface TaxCalculationResult {
  amount: number;
  rate_percent: number;
  tax_amount: number;
  total_amount: number;
}

export type PublicTaxRatesSnapshot = {
  rates: TaxRateRow[];
  defaultRate: number;
};

/** Cached reference rates for storefront/tax API (not POS transactional tax). */
export async function getPublicTaxRatesSnapshot(): Promise<PublicTaxRatesSnapshot> {
  return unstable_cache(
    async () => {
      const [rates, defaultRate] = await Promise.all([
        getAllTaxRates(),
        getDefaultTaxRate(),
      ]);
      return { rates, defaultRate };
    },
    ["public-tax-rates-snapshot"],
    {
      tags: [PUBLIC_TAX_RATES_CACHE_TAG],
      revalidate: 300,
    },
  )();
}

export async function getAllTaxRates(): Promise<TaxRateRow[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("tax_rates")
    .select("*")
    .order("rate_percent", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []) as TaxRateRow[];
}

export async function getTaxRateById(id: string): Promise<TaxRateRow | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("tax_rates")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return data as TaxRateRow | null;
}

export async function getDefaultTaxRate(): Promise<number> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await (supabase.rpc as any)("get_default_tax_rate");

  if (error) throw new Error(error.message);

  return (data as number) ?? 18; // Default to 18% if not configured
}

export async function createTaxRate(
  name: string,
  ratePercent: number,
  description?: string,
  isDefault?: boolean,
): Promise<string> {
  await requireAdminApiProfile();

  if (ratePercent < 0 || ratePercent > 100) {
    throw new Error("Tax rate must be between 0 and 100");
  }

  const supabase = await createSupabaseServerClient();

  // If setting as default, unset other defaults
  if (isDefault) {
    await supabase
      .from("tax_rates")
      .update({ is_default: false })
      .neq("id", "00000000-0000-0000-0000-000000000000"); // Dummy condition to trigger update
  }

  const { data, error } = await supabase
    .from("tax_rates")
    .insert({
      name,
      rate_percent: ratePercent,
      description: description ?? null,
      is_default: isDefault ?? false,
    })
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Failed to create tax rate");

  revalidatePublicTaxRates();

  return data.id;
}

export async function updateTaxRate(
  id: string,
  updates: {
    name?: string;
    ratePercent?: number;
    description?: string;
    isDefault?: boolean;
  },
): Promise<void> {
  await requireAdminApiProfile();

  if (updates.ratePercent !== undefined) {
    if (updates.ratePercent < 0 || updates.ratePercent > 100) {
      throw new Error("Tax rate must be between 0 and 100");
    }
  }

  const supabase = await createSupabaseServerClient();

  const updateData: Database["public"]["Tables"]["tax_rates"]["Update"] = {};
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.ratePercent !== undefined)
    updateData.rate_percent = updates.ratePercent;
  if (updates.description !== undefined)
    updateData.description = updates.description;
  if (updates.isDefault !== undefined) updateData.is_default = updates.isDefault;

  // If setting as default, unset other defaults first
  if (updates.isDefault === true) {
    await supabase
      .from("tax_rates")
      .update({ is_default: false })
      .neq("id", id);
  }

  const { error } = await supabase
    .from("tax_rates")
    .update(updateData)
    .eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePublicTaxRates();
}

export async function deleteTaxRate(id: string): Promise<void> {
  await requireAdminApiProfile();

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("tax_rates").delete().eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePublicTaxRates();
}

export function calculateTax(
  amount: number,
  ratePercent: number,
): TaxCalculationResult {
  const taxAmount = Math.round((amount * ratePercent) / 100 * 100) / 100;
  const totalAmount = amount + taxAmount;

  return {
    amount,
    rate_percent: ratePercent,
    tax_amount: taxAmount,
    total_amount: totalAmount,
  };
}

export async function calculateTaxForOrder(
  amount: number,
  taxRateId?: string,
): Promise<TaxCalculationResult> {
  let ratePercent: number;

  if (taxRateId) {
    const rate = await getTaxRateById(taxRateId);
    if (!rate) {
      throw new Error("Tax rate not found");
    }
    ratePercent = rate.rate_percent;
  } else {
    ratePercent = await getDefaultTaxRate();
  }

  return calculateTax(amount, ratePercent);
}
