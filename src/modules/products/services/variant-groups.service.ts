import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";

export async function insertVariantGroup(input: {
  productId: string;
  name: string;
  sortOrder?: number;
}): Promise<string> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("variant_groups")
    .insert({
      product_id: input.productId,
      name: input.name.trim(),
      sort_order: input.sortOrder ?? 0,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("Variant group insert failed.");
  return data.id;
}

export async function updateVariantGroupById(
  id: string,
  input: { name: string },
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("variant_groups")
    .update({ name: input.name.trim() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listVariantGroupsForProduct(
  productId: string,
): Promise<Array<{ id: string; name: string; sort_order: number }>> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("variant_groups")
    .select("id,name,sort_order")
    .eq("product_id", productId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}
