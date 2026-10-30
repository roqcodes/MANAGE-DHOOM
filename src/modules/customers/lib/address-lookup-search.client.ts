"use client";

import { adminGet, adminPost } from "@/modules/admin/lib/admin-api-client";
import { tryCreateSupabaseBrowserClient } from "@/lib/integrations/supabase/client";

export type AddressLookupKind = "city" | "mall" | "street";

export type AddressLookupRow = { id: string; name: string };

export type AddressLookupContext = {
  cityId?: string | null;
  streetId?: string | null;
};

export const ADDRESS_LOOKUP_DEBOUNCE_MS = 80;
export const ADDRESS_LOOKUP_STALE_MS = 5 * 60_000;
export const ADDRESS_LOOKUP_GC_MS = 30 * 60_000;
export const ADDRESS_LOOKUP_LIMIT = 25;

const TABLE_BY_KIND: Record<AddressLookupKind, string> = {
  city: "erp_address_cities",
  mall: "erp_address_malls",
  street: "erp_address_streets",
};

type RpcRow = { id: string; name: string };

function normalizeLookupName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function namesMatch(a: string, b: string): boolean {
  return normalizeLookupName(a).toLowerCase() === normalizeLookupName(b).toLowerCase();
}

export function addressLookupQueryKey(
  kind: AddressLookupKind,
  query: string,
  ctx: AddressLookupContext = {},
) {
  return [
    "admin",
    "address-lookup",
    kind,
    ctx.cityId ?? "",
    ctx.streetId ?? "",
    query.trim(),
  ] as const;
}

/** Browser → Supabase RPC (skips Next.js API hop). */
export async function rpcSearchAddressLookups(
  kind: AddressLookupKind,
  query: string,
  ctx: AddressLookupContext = {},
): Promise<AddressLookupRow[] | null> {
  if (kind === "street" && !ctx.cityId) return [];
  if (kind === "mall" && !ctx.streetId) return [];

  const supabase = tryCreateSupabaseBrowserClient();
  if (!supabase) return null;

  const { data, error } = await (supabase as unknown as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  }).rpc("erp_search_address_lookups", {
    p_kind: kind,
    p_query: query.trim(),
    p_limit: ADDRESS_LOOKUP_LIMIT,
    p_city_id: ctx.cityId ?? null,
    p_street_id: ctx.streetId ?? null,
  });

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[address-lookup] RPC failed:", error.message);
    }
    return null;
  }

  return ((data ?? []) as RpcRow[]).map((row) => ({
    id: row.id,
    name: row.name,
  }));
}

export async function fetchAddressLookups(
  kind: AddressLookupKind,
  query: string,
  ctx: AddressLookupContext = {},
): Promise<AddressLookupRow[]> {
  if (kind === "street" && !ctx.cityId) return [];
  if (kind === "mall" && !ctx.streetId) return [];

  const rpcRows = await rpcSearchAddressLookups(kind, query, ctx);
  if (rpcRows) return rpcRows;

  const params = new URLSearchParams({ kind, q: query.trim() });
  if (ctx.cityId) params.set("cityId", ctx.cityId);
  if (ctx.streetId) params.set("streetId", ctx.streetId);

  const res = await adminGet<{ data: AddressLookupRow[] }>(
    `erp/address-lookups?${params.toString()}`,
  );
  return res.data ?? [];
}

/** Browser insert (fast path). Falls back to null → API. */
export async function rpcCreateAddressLookup(
  kind: AddressLookupKind,
  rawName: string,
  ctx: AddressLookupContext = {},
): Promise<AddressLookupRow | null> {
  const name = normalizeLookupName(rawName);
  if (!name) throw new Error("Name is required");

  const cityId = ctx.cityId ?? null;
  const streetId = ctx.streetId ?? null;

  if (kind === "street" && !cityId) {
    throw new Error("Select a city before adding a street.");
  }
  if (kind === "mall" && !streetId) {
    throw new Error("Select a street before adding a mall.");
  }

  const supabase = tryCreateSupabaseBrowserClient();
  if (!supabase) return null;

  const table = TABLE_BY_KIND[kind];
  const insertPayload =
    kind === "city"
      ? { name }
      : kind === "street"
        ? { name, city_id: cityId }
        : { name, street_id: streetId };

  const client = supabase as unknown as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => {
        select: (cols: string) => {
          single: () => Promise<{ data: AddressLookupRow | null; error: { message: string } | null }>;
        };
      };
    };
  };

  const { data: inserted, error: insertError } = await client
    .from(table)
    .insert(insertPayload)
    .select("id, name")
    .single();

  if (!insertError && inserted) {
    return inserted;
  }

  if (insertError && !/duplicate|unique/i.test(insertError.message)) {
    throw new Error(insertError.message);
  }

  const searchCtx =
    kind === "street"
      ? { cityId }
      : kind === "mall"
        ? { cityId, streetId }
        : {};
  const matches = await rpcSearchAddressLookups(kind, name, searchCtx);
  const existing = matches?.find((row) => namesMatch(row.name, name));
  return existing ?? null;
}

export async function createAddressLookup(
  kind: AddressLookupKind,
  name: string,
  ctx: AddressLookupContext = {},
): Promise<AddressLookupRow> {
  const rpcRow = await rpcCreateAddressLookup(kind, name, ctx);
  if (rpcRow) return rpcRow;

  const res = await adminPost<{ row: AddressLookupRow }>("erp/address-lookups", {
    kind,
    name: normalizeLookupName(name),
    cityId: ctx.cityId ?? null,
    streetId: ctx.streetId ?? null,
  });
  return res.row;
}

export function prefetchAddressLookups(
  queryClient: {
    prefetchQuery: (opts: {
      queryKey: readonly unknown[];
      queryFn: () => Promise<AddressLookupRow[]>;
      staleTime?: number;
    }) => Promise<void>;
  },
  kind: AddressLookupKind,
  ctx: AddressLookupContext,
  query = "",
) {
  return queryClient.prefetchQuery({
    queryKey: addressLookupQueryKey(kind, query, ctx),
    queryFn: () => fetchAddressLookups(kind, query, ctx),
    staleTime: ADDRESS_LOOKUP_STALE_MS,
  });
}
