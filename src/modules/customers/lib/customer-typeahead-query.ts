import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AdminUser } from "@/common/admin/types";
import type { Database } from "@/lib/integrations/supabase/types";
import {
  buildIlikePattern,
  buildPrefixIlikePattern,
  CUSTOMER_ROLE_OR_FILTER,
} from "@/modules/customers/lib/customer-query";
import {
  pinWalkingCustomerRows,
  walkingCustomerMatchesSearchQuery,
} from "@/modules/customers/lib/walking-customer-search";
import {
  WALKING_CUSTOMER_EMAIL,
  WALKING_CUSTOMER_ID,
  WALKING_CUSTOMER_NAME,
  WALKING_CUSTOMER_NUMBER,
} from "@/modules/customers/lib/walking-customer";

export type CustomerTypeaheadRow = Pick<
  AdminUser,
  "id" | "name" | "email" | "phone" | "customer_number" | "avatar_url"
> & {
  current_balance?: number | null;
};

type CustomerRpcRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  customer_number: string | null;
  avatar_url: string | null;
  current_balance?: number | null;
};

/** One-round-trip customer search (exact → prefix → substring). Falls back to PostgREST if RPC missing. */
async function loadWalkingCustomerTypeaheadRow(
  supabase: SupabaseClient<Database>,
): Promise<CustomerTypeaheadRow | null> {
  const { data, error } = await supabase
    .from("users")
    .select("id, name, email, phone, customer_number, avatar_url")
    .eq("id", WALKING_CUSTOMER_ID)
    .maybeSingle();
  if (error || !data) return null;
  return { ...(data as CustomerTypeaheadRow), current_balance: 0 };
}

const FALLBACK_WALKING_TYPEAHEAD_ROW: CustomerTypeaheadRow = {
  id: WALKING_CUSTOMER_ID,
  name: WALKING_CUSTOMER_NAME,
  email: WALKING_CUSTOMER_EMAIL,
  phone: null,
  customer_number: WALKING_CUSTOMER_NUMBER,
  avatar_url: null,
  current_balance: 0,
};

function applyWalkingCustomerPin(
  rows: CustomerTypeaheadRow[],
  query: string,
  walking: CustomerTypeaheadRow | null,
): CustomerTypeaheadRow[] {
  const pinRow =
    walking ??
    (walkingCustomerMatchesSearchQuery(query) ? FALLBACK_WALKING_TYPEAHEAD_ROW : null);
  if (!pinRow) return rows;
  return pinWalkingCustomerRows(rows, query, pinRow);
}

export async function searchCustomersTypeahead(
  supabase: SupabaseClient<Database>,
  query: string,
  limit = 20,
): Promise<CustomerTypeaheadRow[]> {
  const trimmed = query.trim();
  const walkingPromise = walkingCustomerMatchesSearchQuery(trimmed)
    ? loadWalkingCustomerTypeaheadRow(supabase)
    : Promise.resolve(null);

  const { data: rpcRows, error: rpcError } = await supabase.rpc(
    "erp_search_customers" as never,
    {
      p_query: trimmed,
      p_limit: limit,
    } as never,
  );

  const walking = await walkingPromise;

  if (!rpcError && Array.isArray(rpcRows)) {
    return applyWalkingCustomerPin(
      (rpcRows as CustomerRpcRow[]) as CustomerTypeaheadRow[],
      trimmed,
      walking,
    );
  }

  if (!trimmed) {
    const { data, error } = await supabase
      .from("users")
      .select("id, name, email, phone, customer_number, avatar_url")
      .or(CUSTOMER_ROLE_OR_FILTER)
      .order("name")
      .limit(limit);
    if (error) throw new Error(error.message);
    return applyWalkingCustomerPin((data ?? []) as CustomerTypeaheadRow[], trimmed, walking);
  }

  const viaPostgrest = await searchCustomersViaPostgrest(supabase, trimmed, limit);
  return applyWalkingCustomerPin(viaPostgrest, trimmed, walking);
}

async function searchCustomersViaPostgrest(
  supabase: SupabaseClient<Database>,
  trimmed: string,
  limit: number,
): Promise<CustomerTypeaheadRow[]> {
  const base = () =>
    supabase
      .from("users")
      .select("id, name, email, phone, customer_number, avatar_url")
      .or(CUSTOMER_ROLE_OR_FILTER);

  const prefix = buildPrefixIlikePattern(trimmed);
  if (prefix) {
    const { data: prefixRows, error: prefixError } = await base()
      .or(
        `name.ilike.${prefix},email.ilike.${prefix},phone.ilike.${prefix},customer_number.ilike.${prefix},contact_display_name.ilike.${prefix}`,
      )
      .order("name")
      .limit(limit);
    if (prefixError) throw new Error(prefixError.message);
    if (prefixRows?.length) {
      return prefixRows as CustomerTypeaheadRow[];
    }
  }

  const pattern = buildIlikePattern(trimmed);
  if (!pattern) return [];

  const { data, error } = await base()
    .or(
      `name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern},customer_number.ilike.${pattern},contact_display_name.ilike.${pattern}`,
    )
    .order("name")
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as CustomerTypeaheadRow[];
}
