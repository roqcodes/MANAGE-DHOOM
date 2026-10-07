import "server-only";

import {
  requireAdminOnlyProfile,
  requireAdminOrManagerProfile,
} from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type { ItemUnit } from "@/common/erp/types";

export async function listItemUnits(): Promise<ItemUnit[]> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("item_units")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ItemUnit[];
}

export async function getItemUnitById(id: string): Promise<ItemUnit | null> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("item_units")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as ItemUnit | null;
}

export async function createItemUnit(input: {
  name: string;
  abbreviation: string;
  sortOrder?: number;
  isActive?: boolean;
}): Promise<ItemUnit> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("item_units")
    .insert({
      name: input.name.trim(),
      abbreviation: input.abbreviation.trim().toUpperCase(),
      sort_order: input.sortOrder ?? 0,
      is_active: input.isActive ?? true,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as ItemUnit;
}

export async function updateItemUnit(
  id: string,
  input: Partial<{
    name: string;
    abbreviation: string;
    is_active: boolean;
    sort_order: number;
  }>,
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const patch: {
    name?: string;
    abbreviation?: string;
    is_active?: boolean;
    sort_order?: number;
  } = { ...input };
  if (typeof input.name === "string") patch.name = input.name.trim();
  if (typeof input.abbreviation === "string") {
    patch.abbreviation = input.abbreviation.trim().toUpperCase();
  }
  const { error } = await supabase.from("item_units").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

async function countItemUnitReferences(unitId: string): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const tables = [
    "product_variants",
    "invoice_items",
    "erp_estimate_lines",
    "erp_purchase_bill_lines",
  ] as const;

  let total = 0;
  for (const table of tables) {
    const query = supabase.from(table) as ReturnType<typeof supabase.from> & {
      eq(column: string, value: string): ReturnType<typeof supabase.from>;
    };
    const { count, error } = await query
      .select("id", { count: "exact", head: true })
      .eq("unit_id", unitId);
    if (error) continue;
    total += count ?? 0;
  }
  return total;
}

export async function deleteItemUnit(id: string): Promise<void> {
  await requireAdminOnlyProfile();
  const refs = await countItemUnitReferences(id);
  if (refs > 0) {
    throw new Error(
      "This unit is used on items or documents. Deactivate it instead of deleting.",
    );
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("item_units").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
