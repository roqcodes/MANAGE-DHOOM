import "server-only";

import { cache } from "react";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type { Database } from "@/lib/integrations/supabase/types";
import type { Category } from "@/common/admin/types";

const CATEGORY_COLUMNS =
  "id,name,parent_id,thumbnail_url,image_url,sort_order,is_active,slug,description,created_at,updated_at";

export const getCategories = cache(async function getCategories(opts?: {
  activeOnly?: boolean;
}): Promise<Category[]> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("categories")
    .select(CATEGORY_COLUMNS)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (opts?.activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Category[];
});

export async function getCategoryById(id: string): Promise<Category | null> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("categories")
    .select(CATEGORY_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Category | null;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface CategoryInput {
  name: string;
  parentId?: string | null;
  imageUrl?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  slug?: string | null;
  description?: string | null;
}

export async function createCategory(input: CategoryInput): Promise<string> {
  await requireAdminOrManagerProfile();
  const name = input.name.trim();
  if (!name) throw new Error("Category name is required.");

  const supabase = await createSupabaseServerClient();
  const slug = input.slug?.trim() || slugify(name);
  const imageUrl = input.imageUrl?.trim() || null;

  const { data, error } = await supabase
    .from("categories")
    .insert({
      name,
      parent_id: input.parentId ?? null,
      thumbnail_url: null,
      image_url: imageUrl,
      sort_order: input.sortOrder ?? 0,
      is_active: input.isActive ?? true,
      slug: slug || null,
      description: input.description?.trim() || null,
    })
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Failed to create category.");
  return data.id;
}

export async function updateCategory(
  id: string,
  input: Partial<CategoryInput>,
): Promise<void> {
  await requireAdminOrManagerProfile();

  if (input.parentId === id) {
    throw new Error("A category cannot be its own parent.");
  }

  const supabase = await createSupabaseServerClient();
  const updateData: Database["public"]["Tables"]["categories"]["Update"] = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Category name is required.");
    updateData.name = name;
  }
  if (input.parentId !== undefined) updateData.parent_id = input.parentId;
  if (input.imageUrl !== undefined) {
    const imageUrl = input.imageUrl?.trim() || null;
    updateData.image_url = imageUrl;
    updateData.thumbnail_url = null;
  }
  if (input.sortOrder !== undefined) updateData.sort_order = input.sortOrder;
  if (input.isActive !== undefined) updateData.is_active = input.isActive;
  if (input.slug !== undefined) updateData.slug = input.slug?.trim() || null;
  if (input.description !== undefined) {
    updateData.description = input.description?.trim() || null;
  }

  const { error } = await supabase
    .from("categories")
    .update(updateData)
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function deleteCategory(id: string): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { count: childCount } = await supabase
    .from("categories")
    .select("id", { count: "exact", head: true })
    .eq("parent_id", id);

  if (childCount && childCount > 0) {
    throw new Error("Cannot delete a category that has subcategories.");
  }

  const { count: productCount } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("category_id", id);

  if (productCount && productCount > 0) {
    throw new Error("Cannot delete a category that has products assigned.");
  }

  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
