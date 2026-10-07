import "server-only";

import { requireVendorProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type { Paginated } from "@/common/admin/types";
import { PAGE_SIZE } from "@/common/admin/types";
import type {
  AvailableCatalogVariantRow,
  VendorProductWithVariant,
} from "@/modules/vendor/types";

export async function listMyVendorProducts(
  page = 0,
): Promise<Paginated<VendorProductWithVariant>> {
  const profile = await requireVendorProfile();
  const supabase = await createSupabaseServerClient();
  const from = page * PAGE_SIZE;

  const { data, count } = await supabase
    .from("vendor_products")
    .select(
      "id,vendor_id,variant_id,base_price,stock,created_at,product_variants(id,name,products(id,name))",
      { count: "exact" },
    )
    .eq("vendor_id", profile.id)
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  return {
    data: (data ?? []) as unknown as VendorProductWithVariant[],
    total: count ?? 0,
  };
}

export async function updateMyVendorProduct(
  vendorProductId: string,
  input: { basePrice?: number; stock?: number },
): Promise<void> {
  const profile = await requireVendorProfile();
  const supabase = await createSupabaseServerClient();

  const updateData: Record<string, number> = {};
  if (input.basePrice !== undefined && input.basePrice > 0) {
    updateData.base_price = input.basePrice;
  }
  if (input.stock !== undefined && input.stock >= 0) {
    updateData.stock = input.stock;
  }

  if (Object.keys(updateData).length === 0) {
    throw new Error("No valid fields to update.");
  }

  const { error } = await supabase
    .from("vendor_products")
    .update(updateData as any)
    .eq("id", vendorProductId)
    .eq("vendor_id", profile.id);

  if (error) throw new Error(error.message);
}

export async function listAvailableCatalogVariants(
  page = 0,
): Promise<Paginated<AvailableCatalogVariantRow>> {
  const profile = await requireVendorProfile();
  const supabase = await createSupabaseServerClient();
  const from = page * PAGE_SIZE;

  const { data: assignedRows } = await supabase
    .from("vendor_products")
    .select("variant_id")
    .eq("vendor_id", profile.id);

  const excluded = (assignedRows ?? [])
    .map((r) => r.variant_id)
    .filter((id): id is string => Boolean(id));

  let query = supabase
    .from("product_variants")
    .select(
      "id,name,products!inner(id,name,is_active,image_url,categories(name))",
      { count: "exact" },
    )
    .eq("products.is_active", true)
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (excluded.length > 0) {
    query = query.not("id", "in", `(${excluded.join(",")})`);
  }

  const { data, count, error } = await query;

  if (error) throw new Error(error.message);

  return {
    data: (data ?? []) as unknown as AvailableCatalogVariantRow[],
    total: count ?? 0,
  };
}

export async function addVariantToMySupply(
  variantId: string,
  input: { basePrice: number; stock: number },
): Promise<void> {
  const profile = await requireVendorProfile();
  const supabase = await createSupabaseServerClient();

  const { data: dup } = await supabase
    .from("vendor_products")
    .select("id")
    .eq("vendor_id", profile.id)
    .eq("variant_id", variantId)
    .maybeSingle();

  if (dup) {
    throw new Error("This variant is already in your supply.");
  }

  const { data: row, error: vErr } = await supabase
    .from("product_variants")
    .select("id,products(is_active)")
    .eq("id", variantId)
    .maybeSingle();

  if (vErr) throw new Error(vErr.message);
  if (!row) {
    throw new Error("Variant not found.");
  }

  const vRow = row as unknown as {
    products: { is_active: boolean | null } | null;
  };
  if (!vRow.products?.is_active) {
    throw new Error("This product is not available.");
  }

  const { error: insErr } = await supabase.from("vendor_products").insert({
    vendor_id: profile.id,
    variant_id: variantId,
    base_price: input.basePrice,
    stock: input.stock,
  });

  if (insErr) {
    if (insErr.code === "23505") {
      throw new Error("This variant is already in your supply.");
    }
    throw new Error(insErr.message);
  }
}
