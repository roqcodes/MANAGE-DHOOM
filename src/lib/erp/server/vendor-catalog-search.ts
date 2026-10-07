import "server-only";

import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { buildIlikePattern } from "@/lib/postgrest-search";
import type { Vendor } from "@/common/admin/types";
import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";

export const VENDOR_PICKER_SEARCH_LIMIT = 20;

/** Active vendors for picker (bounded; no full-catalog load). */
export async function listActiveVendorsForPicker(
  limit = VENDOR_PICKER_SEARCH_LIMIT,
): Promise<Pick<Vendor, "id" | "name">[]> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("vendors")
    .select("id, name")
    .eq("is_active", true)
    .order("name", { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as Pick<Vendor, "id" | "name">[];
}

export async function searchActiveVendorsQuery(
  query: string,
  limit = VENDOR_PICKER_SEARCH_LIMIT,
): Promise<Pick<Vendor, "id" | "name">[]> {
  await requireAdminOrManagerProfile();
  const trimmed = query.trim();
  if (!trimmed) {
    return listActiveVendorsForPicker(limit);
  }

  const supabase = await createSupabaseServerClient();
  const pattern = buildIlikePattern(trimmed);
  if (!pattern) {
    return listActiveVendorsForPicker(limit);
  }

  const { data, error } = await supabase
    .from("vendors")
    .select("id, name")
    .eq("is_active", true)
    .or(
      `name.ilike.${pattern},contact.ilike.${pattern},email.ilike.${pattern},trn.ilike.${pattern},phone.ilike.${pattern}`,
    )
    .order("name")
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as Pick<Vendor, "id" | "name">[];
}
