import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AdminUser } from "@/common/admin/types";
import type { Database } from "@/lib/integrations/supabase/types";
import {
  buildIlikePattern,
  buildPrefixIlikePattern,
  CUSTOMER_ROLE_OR_FILTER,
} from "@/modules/customers/lib/customer-query";

export type CustomerTypeaheadRow = Pick<
  AdminUser,
  "id" | "name" | "email" | "phone" | "customer_number"
>;

type CustomerRpcRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  customer_number: string | null;
};

/** One-round-trip customer search (exact → prefix → substring). Falls back to PostgREST if RPC missing. */
export async function searchCustomersTypeahead(
  supabase: SupabaseClient<Database>,
  query: string,
  limit = 20,
): Promise<CustomerTypeaheadRow[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    const { data, error } = await supabase
      .from("users")
      .select("id, name, email, phone, customer_number")
      .or(CUSTOMER_ROLE_OR_FILTER)
      .order("name")
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as CustomerTypeaheadRow[];
  }

  const { data: rpcRows, error: rpcError } = await supabase.rpc(
    "erp_search_customers" as never,
    {
      p_query: trimmed,
      p_limit: limit,
    } as never,
  );

  if (!rpcError && Array.isArray(rpcRows)) {
    return (rpcRows as CustomerRpcRow[]) as CustomerTypeaheadRow[];
  }

  return searchCustomersViaPostgrest(supabase, trimmed, limit);
}

async function searchCustomersViaPostgrest(
  supabase: SupabaseClient<Database>,
  trimmed: string,
  limit: number,
): Promise<CustomerTypeaheadRow[]> {
  const base = () =>
    supabase
      .from("users")
      .select("id, name, email, phone, customer_number")
      .or(CUSTOMER_ROLE_OR_FILTER);

  const prefix = buildPrefixIlikePattern(trimmed);
  if (prefix) {
    const { data: prefixRows, error: prefixError } = await base()
      .or(
        `name.ilike.${prefix},email.ilike.${prefix},phone.ilike.${prefix},customer_number.ilike.${prefix}`,
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
      `name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern},customer_number.ilike.${pattern}`,
    )
    .order("name")
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as CustomerTypeaheadRow[];
}
