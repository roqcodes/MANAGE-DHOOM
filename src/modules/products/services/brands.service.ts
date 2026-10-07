import "server-only";

import { cache } from "react";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type { Database } from "@/lib/integrations/supabase/types";
import type { Brand } from "@/common/admin/types";

const BRAND_COLUMNS =
  "id,name,logo_url,image_url,sort_order,is_active,slug,description,created_at,updated_at";

export const getBrands = cache(async function getBrands(opts?: {
  activeOnly?: boolean;
}): Promise<Brand[]> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("brands")
    .select(BRAND_COLUMNS)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (opts?.activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Brand[];
});

export async function getBrandById(id: string): Promise<Brand | null> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("brands")
    .select(BRAND_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Brand | null;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface BrandInput {
  name: string;
  imageUrl?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  slug?: string | null;
  description?: string | null;
}

export async function createBrand(input: BrandInput): Promise<string> {
  await requireAdminOrManagerProfile();
  const name = input.name.trim();
  if (!name) throw new Error("Brand name is required.");

  const supabase = await createSupabaseServerClient();
  const slug = input.slug?.trim() || slugify(name);
  const imageUrl = input.imageUrl?.trim() || null;

  const { data, error } = await supabase
    .from("brands")
    .insert({
      name,
      logo_url: null,
      image_url: imageUrl,
      sort_order: input.sortOrder ?? 0,
      is_active: input.isActive ?? true,
      slug: slug || null,
      description: input.description?.trim() || null,
    })
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Failed to create brand.");
  return data.id;
}

export async function updateBrand(
  id: string,
  input: Partial<BrandInput>,
): Promise<void> {
  await requireAdminOrManagerProfile();

  const supabase = await createSupabaseServerClient();
  const updateData: Database["public"]["Tables"]["brands"]["Update"] = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Brand name is required.");
    updateData.name = name;
  }
  if (input.imageUrl !== undefined) {
    const imageUrl = input.imageUrl?.trim() || null;
    updateData.image_url = imageUrl;
    updateData.logo_url = null;
  }
  if (input.sortOrder !== undefined) updateData.sort_order = input.sortOrder;
  if (input.isActive !== undefined) updateData.is_active = input.isActive;
  if (input.slug !== undefined) updateData.slug = input.slug?.trim() || null;
  if (input.description !== undefined) {
    updateData.description = input.description?.trim() || null;
  }

  const { error } = await supabase.from("brands").update(updateData).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteBrand(id: string): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { count: productCount } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", id);

  if (productCount && productCount > 0) {
    throw new Error("Cannot delete a brand that has products assigned.");
  }

  const { error } = await supabase.from("brands").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
