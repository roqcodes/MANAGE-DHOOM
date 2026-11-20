import "server-only";

import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { buildIlikePattern } from "@/lib/postgrest-search";
import type { Vendor } from "@/common/admin/types";
import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";

export const VENDOR_PICKER_SEARCH_LIMIT = 20;

export type VendorTypeaheadRow = Pick<Vendor, "id" | "name"> & {
  email?: string | null;
  phone?: string | null;
  contact?: string | null;
  trn?: string | null;
  current_balance?: number | null;
};

/** Active vendors for picker (bounded; no full-catalog load). */
export async function listActiveVendorsForPicker(
  limit = VENDOR_PICKER_SEARCH_LIMIT,
): Promise<VendorTypeaheadRow[]> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("vendors")
    .select("id, name, email, phone, contact, trn")
    .eq("is_active", true)
    .order("name", { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as VendorTypeaheadRow[];
}

export async function searchActiveVendorsQuery(
  query: string,
  limit = VENDOR_PICKER_SEARCH_LIMIT,
): Promise<VendorTypeaheadRow[]> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const trimmed = query.trim();

  const { data: rpcRows, error: rpcError } = await supabase.rpc(
    "erp_search_vendors" as never,
    {
      p_query: trimmed,
      p_limit: limit,
    } as never,
  );

  if (!rpcError && Array.isArray(rpcRows)) {
    return rpcRows as VendorTypeaheadRow[];
  }

  if (!trimmed) {
    return listActiveVendorsForPicker(limit);
  }

  const pattern = buildIlikePattern(trimmed);
  if (!pattern) {
    return listActiveVendorsForPicker(limit);
  }

  const { data, error } = await supabase
    .from("vendors")
    .select("id, name, email, phone, contact, trn")
    .eq("is_active", true)
    .or(
      `name.ilike.${pattern},contact.ilike.${pattern},email.ilike.${pattern},trn.ilike.${pattern},phone.ilike.${pattern}`,
    )
    .order("name")
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as VendorTypeaheadRow[];
}
