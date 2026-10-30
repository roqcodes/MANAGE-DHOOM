import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { buildIlikePattern, buildPrefixIlikePattern } from "@/lib/postgrest-search";
import { invokeRpc } from "@/lib/integrations/supabase/rpc";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type { Database } from "@/lib/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AddressLookupKind = "city" | "mall" | "street";

export type AddressLookupRow = { id: string; name: string };

export type AddressLookupContext = {
  cityId?: string | null;
  streetId?: string | null;
};

const TABLE_BY_KIND: Record<AddressLookupKind, keyof Pick<
  Database["public"]["Tables"],
  "erp_address_cities" | "erp_address_streets" | "erp_address_malls"
>> = {
  city: "erp_address_cities",
  mall: "erp_address_malls",
  street: "erp_address_streets",
};

function normalizeLookupName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

type ServerSupabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export async function assertCustomerAddressHierarchy(
  supabase: ServerSupabase,
  selection: {
    cityId?: string | null;
    streetId?: string | null;
    mallId?: string | null;
  },
): Promise<void> {
  const cityId = selection.cityId ?? null;
  const streetId = selection.streetId ?? null;
  const mallId = selection.mallId ?? null;

  if (streetId && !cityId) {
    throw new Error("Select a city before choosing a street.");
  }
  if (mallId && !streetId) {
    throw new Error("Select a street before choosing a mall.");
  }
  if (mallId && !cityId) {
    throw new Error("Select a city before choosing a mall.");
  }

  if (streetId && cityId) {
    const { data: street, error } = await supabase
      .from("erp_address_streets")
      .select("city_id")
      .eq("id", streetId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!street?.city_id || street.city_id !== cityId) {
      throw new Error("The selected street does not belong to this city.");
    }
  }

  if (mallId && streetId) {
    const { data: mall, error } = await supabase
      .from("erp_address_malls")
      .select("street_id")
      .eq("id", mallId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!mall?.street_id || mall.street_id !== streetId) {
      throw new Error("The selected mall does not belong to this street.");
    }
  }
}

/** Drop child selections that no longer match parents (edit / stale data). */
export async function normalizeCustomerAddressSelection(
  supabase: ServerSupabase,
  selection: {
    cityId?: string | null;
    streetId?: string | null;
    mallId?: string | null;
  },
): Promise<{ cityId: string | null; streetId: string | null; mallId: string | null }> {
  let cityId = selection.cityId ?? null;
  let streetId = selection.streetId ?? null;
  let mallId = selection.mallId ?? null;

  if (streetId) {
    const { data: street } = await supabase
      .from("erp_address_streets")
      .select("city_id")
      .eq("id", streetId)
      .maybeSingle();
    if (!street?.city_id || (cityId && street.city_id !== cityId)) {
      streetId = null;
      mallId = null;
    } else if (!cityId) {
      cityId = street.city_id;
    }
  }

  if (mallId) {
    const { data: mall } = await supabase
      .from("erp_address_malls")
      .select("street_id")
      .eq("id", mallId)
      .maybeSingle();
    if (!mall?.street_id || (streetId && mall.street_id !== streetId)) {
      mallId = null;
    } else if (!streetId) {
      streetId = mall.street_id;
      if (!cityId) {
        const { data: street } = await supabase
          .from("erp_address_streets")
          .select("city_id")
          .eq("id", streetId)
          .maybeSingle();
        cityId = street?.city_id ?? null;
      }
    }
  }

  return { cityId, streetId, mallId };
}

/** One round-trip for lookup rows + in-memory normalize (profile load hot path). */
export async function resolveCustomerAddressProfile(
  supabase: ServerSupabase,
  selection: {
    cityId?: string | null;
    streetId?: string | null;
    mallId?: string | null;
  },
  legacy?: {
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    state?: string | null;
    pincode?: string | null;
  },
): Promise<{
  normalized: { cityId: string | null; streetId: string | null; mallId: string | null };
  lookupNames: { city: string | null; mall: string | null; street: string | null };
  composedAddress: string | null;
}> {
  const empty = {
    normalized: { cityId: null as string | null, streetId: null, mallId: null },
    lookupNames: { city: null as string | null, mall: null, street: null },
    composedAddress: null as string | null,
  };

  let cityId = selection.cityId ?? null;
  let streetId = selection.streetId ?? null;
  let mallId = selection.mallId ?? null;

  if (!cityId && !streetId && !mallId && !legacy?.line1?.trim()) {
    return empty;
  }

  const [cityRes, streetRes, mallRes] = await Promise.all([
    cityId
      ? supabase.from("erp_address_cities").select("name").eq("id", cityId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    streetId
      ? supabase
          .from("erp_address_streets")
          .select("name, city_id")
          .eq("id", streetId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    mallId
      ? supabase
          .from("erp_address_malls")
          .select("name, street_id")
          .eq("id", mallId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (cityRes.error) throw new Error(cityRes.error.message);
  if (streetRes.error) throw new Error(streetRes.error.message);
  if (mallRes.error) throw new Error(mallRes.error.message);

  const streetRow = streetRes.data as { name: string; city_id: string | null } | null;
  const mallRow = mallRes.data as { name: string; street_id: string | null } | null;
  let cityName = (cityRes.data as { name: string } | null)?.name ?? null;
  let streetName = streetRow?.name ?? null;
  let mallName = mallRow?.name ?? null;

  if (streetId) {
    if (!streetRow?.city_id || (cityId && streetRow.city_id !== cityId)) {
      streetId = null;
      mallId = null;
      streetName = null;
      mallName = null;
    } else if (!cityId) {
      cityId = streetRow.city_id;
    }
  }

  if (mallId) {
    if (!mallRow?.street_id || (streetId && mallRow.street_id !== streetId)) {
      mallId = null;
      mallName = null;
    } else if (!streetId) {
      streetId = mallRow.street_id;
      if (streetRow && streetId === selection.streetId) {
        streetName = streetRow.name;
        if (!cityId) cityId = streetRow.city_id ?? null;
      } else if (streetId) {
        const { data: impliedStreet, error } = await supabase
          .from("erp_address_streets")
          .select("name, city_id")
          .eq("id", streetId)
          .maybeSingle();
        if (error) throw new Error(error.message);
        streetName = impliedStreet?.name ?? null;
        if (!cityId) cityId = impliedStreet?.city_id ?? null;
      }
    }
  }

  if (cityId && !cityName) {
    const { data: cityRow, error } = await supabase
      .from("erp_address_cities")
      .select("name")
      .eq("id", cityId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    cityName = cityRow?.name ?? null;
  }

  const lookupNames = { city: cityName, mall: mallName, street: streetName };
  const composedAddress =
    (composeCustomerAddressLine({
      mall: lookupNames.mall,
      street: lookupNames.street,
      city: lookupNames.city,
      legacyLine1: legacy?.line1,
    }) ??
      (legacy
        ? [legacy.line1, legacy.line2, legacy.city, legacy.state, legacy.pincode]
            .filter(Boolean)
            .join(", ")
        : null)) || null;

  return {
    normalized: { cityId, streetId, mallId },
    lookupNames,
    composedAddress: composedAddress || null,
  };
}

export async function searchCustomerAddressLookups(
  kind: AddressLookupKind,
  query: string,
  ctx: AddressLookupContext = {},
  limit = 25,
): Promise<AddressLookupRow[]> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const trimmed = query.trim();
  const cityId = ctx.cityId ?? null;
  const streetId = ctx.streetId ?? null;

  if (kind === "street" && !cityId) return [];
  if (kind === "mall" && !streetId) return [];

  const { data: rpcRows, error: rpcError } = await invokeRpc(supabase, "erp_search_address_lookups", {
    p_kind: kind,
    p_query: trimmed,
    p_limit: limit,
    p_city_id: cityId,
    p_street_id: streetId,
  });

  if (!rpcError && Array.isArray(rpcRows)) {
    return (rpcRows as AddressLookupRow[]).map((row) => ({
      id: row.id,
      name: row.name,
    }));
  }

  return searchCustomerAddressLookupsFallback(supabase, kind, trimmed, ctx, limit);
}

async function searchCustomerAddressLookupsFallback(
  supabase: SupabaseClient,
  kind: AddressLookupKind,
  trimmed: string,
  ctx: AddressLookupContext,
  limit: number,
): Promise<AddressLookupRow[]> {
  const cityId = ctx.cityId ?? null;
  const streetId = ctx.streetId ?? null;

  const applyNameFilter = <T extends { ilike: (col: string, pattern: string) => T }>(
    request: T,
  ): T => {
    if (!trimmed) return request;
    const prefix = buildPrefixIlikePattern(trimmed);
    if (prefix) return request.ilike("name", prefix);
    const contains = buildIlikePattern(trimmed);
    if (contains) return request.ilike("name", contains);
    return request;
  };

  if (kind === "city") {
    const { data, error } = await applyNameFilter(
      supabase
        .from("erp_address_cities")
        .select("id, name")
        .order("name", { ascending: true })
        .limit(limit),
    );
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({ id: row.id, name: row.name }));
  }

  if (kind === "street") {
    if (!cityId) return [];
    const { data, error } = await applyNameFilter(
      supabase
        .from("erp_address_streets")
        .select("id, name")
        .eq("city_id", cityId)
        .order("name", { ascending: true })
        .limit(limit),
    );
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({ id: row.id, name: row.name }));
  }

  if (!streetId) return [];
  const { data, error } = await applyNameFilter(
    supabase
      .from("erp_address_malls")
      .select("id, name")
      .eq("street_id", streetId)
      .order("name", { ascending: true })
      .limit(limit),
  );
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ id: row.id, name: row.name }));
}

export async function createCustomerAddressLookup(
  kind: AddressLookupKind,
  rawName: string,
  ctx: AddressLookupContext = {},
): Promise<AddressLookupRow> {
  await requireAdminOrManagerProfile();
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

  const supabase = await createSupabaseServerClient();

  if (kind === "mall" && cityId) {
    await assertCustomerAddressHierarchy(supabase, { cityId, streetId });
  }

  const table = TABLE_BY_KIND[kind];
  const insertPayload =
    kind === "city"
      ? { name }
      : kind === "street"
        ? { name, city_id: cityId }
        : { name, street_id: streetId };

  const { data: inserted, error: insertError } = await supabase
    .from(table)
    .insert(insertPayload as never)
    .select("id, name")
    .maybeSingle();

  if (!insertError && inserted) {
    return inserted;
  }

  if (insertError && !/duplicate|unique/i.test(insertError.message)) {
    throw new Error(insertError.message);
  }

  let candidates: AddressLookupRow[] | null = null;
  let findError: { message: string } | null = null;

  if (kind === "city") {
    const res = await supabase
      .from("erp_address_cities")
      .select("id, name")
      .ilike("name", buildIlikePattern(name)!);
    candidates = res.data;
    findError = res.error;
  } else if (kind === "street" && cityId) {
    const res = await supabase
      .from("erp_address_streets")
      .select("id, name")
      .eq("city_id", cityId)
      .ilike("name", buildIlikePattern(name)!);
    candidates = res.data;
    findError = res.error;
  } else if (kind === "mall" && streetId) {
    const res = await supabase
      .from("erp_address_malls")
      .select("id, name")
      .eq("street_id", streetId)
      .ilike("name", buildIlikePattern(name)!);
    candidates = res.data;
    findError = res.error;
  }

  if (findError) throw new Error(findError.message);

  const existing = (candidates ?? []).find(
    (row) => row.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (existing) return existing;

  throw new Error(insertError?.message ?? "Could not save lookup value");
}

export async function resolveAddressLookupNames(ids: {
  cityId?: string | null;
  mallId?: string | null;
  streetId?: string | null;
}): Promise<{ city: string | null; mall: string | null; street: string | null }> {
  const supabase = await createSupabaseServerClient();
  const [cityRes, mallRes, streetRes] = await Promise.all([
    ids.cityId
      ? supabase.from("erp_address_cities").select("name").eq("id", ids.cityId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    ids.mallId
      ? supabase.from("erp_address_malls").select("name, street_id").eq("id", ids.mallId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    ids.streetId
      ? supabase.from("erp_address_streets").select("name, city_id").eq("id", ids.streetId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (cityRes.error) throw new Error(cityRes.error.message);
  if (mallRes.error) throw new Error(mallRes.error.message);
  if (streetRes.error) throw new Error(streetRes.error.message);

  return {
    city: cityRes.data?.name ?? null,
    mall: mallRes.data?.name ?? null,
    street: streetRes.data?.name ?? null,
  };
}

export function composeCustomerAddressLine(parts: {
  mall?: string | null;
  street?: string | null;
  city?: string | null;
  legacyLine1?: string | null;
}): string | null {
  const segments = [parts.mall, parts.street, parts.city].filter(
    (s): s is string => Boolean(s?.trim()),
  );
  if (segments.length > 0) return segments.join(", ");
  const legacy = parts.legacyLine1?.trim();
  return legacy || null;
}
