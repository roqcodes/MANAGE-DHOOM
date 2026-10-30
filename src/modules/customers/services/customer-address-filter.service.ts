import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/integrations/supabase/types";
import {
  hasActiveAddressHierarchyFilter,
  type AddressHierarchyFilterParams,
} from "@/modules/customers/lib/address-hierarchy-filter";

const NO_MATCH_USER_ID = "00000000-0000-0000-0000-000000000000";

export async function resolveUserIdsForAddressFilter(
  supabase: SupabaseClient<Database>,
  filter: AddressHierarchyFilterParams,
): Promise<string[] | null> {
  if (!hasActiveAddressHierarchyFilter(filter)) return null;

  const { data, error } = await supabase.rpc("erp_filter_user_ids_by_address", {
    p_city_id: filter.cityId?.trim() || null,
    p_street_id: filter.streetId?.trim() || null,
    p_mall_id: filter.mallId?.trim() || null,
  });

  if (error) {
    if (/erp_filter_user_ids_by_address|does not exist|Could not find/i.test(error.message)) {
      return resolveUserIdsForAddressFilterFallback(supabase, filter);
    }
    throw new Error(error.message);
  }

  return (data ?? []) as string[];
}

async function resolveUserIdsForAddressFilterFallback(
  supabase: SupabaseClient<Database>,
  filter: AddressHierarchyFilterParams,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("addresses")
    .select("user_id, city_id, street_id, mall_id")
    .eq("is_default", true);

  if (error) throw new Error(error.message);

  const ids: string[] = [];
  for (const row of data ?? []) {
    if (!row.user_id) continue;
    if (filter.mallId && row.mall_id !== filter.mallId) continue;
    if (filter.streetId && row.street_id !== filter.streetId) continue;
    if (filter.cityId && row.city_id !== filter.cityId) continue;
    ids.push(row.user_id);
  }
  return ids;
}

export function applyUserIdInFilter<T extends { in: (col: string, values: string[]) => T; eq: (col: string, value: string) => T }>(
  query: T,
  column: string,
  userIds: string[] | null,
): T {
  if (userIds === null) return query;
  if (userIds.length === 0) {
    return query.eq(column, NO_MATCH_USER_ID);
  }
  if (userIds.length === 1) {
    return query.eq(column, userIds[0]!);
  }
  return query.in(column, userIds);
}

export function parseAddressFilterFromQuery(query: {
  cityId?: string | null;
  streetId?: string | null;
  mallId?: string | null;
}): AddressHierarchyFilterParams {
  return {
    cityId: query.cityId?.trim() || null,
    streetId: query.streetId?.trim() || null,
    mallId: query.mallId?.trim() || null,
  };
}
