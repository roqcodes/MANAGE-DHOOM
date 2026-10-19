import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import {
  assertUniqueVariantGroupName,
  rethrowUniqueNameViolation,
  trimMasterName,
} from "@/lib/erp/master-name-uniqueness";

export async function insertVariantGroup(input: {
  productId: string;
  name: string;
  sortOrder?: number;
}): Promise<string> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const name = trimMasterName(input.name);
  if (!name) throw new Error("Variant group name is required");
  await assertUniqueVariantGroupName(supabase, input.productId, name);

  const { data, error } = await supabase
    .from("variant_groups")
    .insert({
      product_id: input.productId,
      name,
      sort_order: input.sortOrder ?? 0,
    })
    .select("id")
    .single();

  if (error) {
    rethrowUniqueNameViolation(error, "variant group");
    throw new Error(error.message);
  }
  if (!data?.id) throw new Error("Variant group insert failed.");
  return data.id;
}

export async function updateVariantGroupById(
  id: string,
  input: { name: string },
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const name = trimMasterName(input.name);
  if (!name) throw new Error("Variant group name is required");
  const { data: existing, error: loadErr } = await supabase
    .from("variant_groups")
    .select("product_id")
    .eq("id", id)
    .maybeSingle();
  if (loadErr) throw new Error(loadErr.message);
  if (!existing?.product_id) throw new Error("Variant group not found");
  await assertUniqueVariantGroupName(supabase, existing.product_id, name, id);
  const { error } = await supabase
    .from("variant_groups")
    .update({ name })
    .eq("id", id);
  if (error) {
    rethrowUniqueNameViolation(error, "variant group");
    throw new Error(error.message);
  }
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
