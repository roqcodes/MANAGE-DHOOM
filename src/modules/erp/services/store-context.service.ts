import "server-only";

import { cache } from "react";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type { ErpContext, Store } from "@/common/erp/types";
import { getErpContext } from "@/modules/erp/services/audit-log.service";

const fetchActiveStores = cache(async (): Promise<Store[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("stores")
    .select("id, name, code, company_id, is_active, is_default")
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Store[];
});

export const getAdminErpContext = cache(async (): Promise<ErpContext | null> => {
  await requireAdminOrManagerProfile();
  return getErpContext();
});

/** Active store + store list for the admin shell. One auth check, parallel PostgREST. */
export const getAdminErpShell = cache(async () => {
  await requireAdminOrManagerProfile();
  const [context, stores] = await Promise.all([getErpContext(), fetchActiveStores()]);
  return { context, stores };
});

export const resolveErpStoreId = cache(
  async (explicit?: string | null): Promise<string | null> => {
    if (explicit) return explicit;
    const ctx = await getAdminErpContext();
    if (ctx?.store_id) return ctx.store_id;

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("get_default_store_id");
    if (error) {
      console.error("get_default_store_id failed:", error);
      return null;
    }
    return data ?? null;
  },
);

export async function requireErpStoreId(explicit?: string | null): Promise<string> {
  const storeId = await resolveErpStoreId(explicit);
  if (!storeId) {
    throw new Error("Store context is required. Select a store using the header switcher.");
  }
  return storeId;
}

/** Store-owned accounts plus company-wide (null store_id) accounts. */
export function withAccountStoreScope<T extends { or: (filter: string) => T }>(
  query: T,
  storeId: string | null | undefined,
): T {
  if (!storeId) return query;
  return query.or(`store_id.eq.${storeId},store_id.is.null`);
}

export const listActiveStores = cache(async (): Promise<Store[]> => {
  await requireAdminOrManagerProfile();
  return fetchActiveStores();
});

export async function setActiveStore(storeId: string): Promise<ErpContext | null> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("set_user_active_store", {
    p_store_id: storeId,
  });
  if (error) throw new Error(error.message);
  return data as unknown as ErpContext;
}
