"use client";

import type { QueryClient } from "@tanstack/react-query";

import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import {
  rpcSearchCustomers,
  rpcSearchVendors,
} from "@/modules/erp/lib/catalog-typeahead-rpc.client";

export type EntitySearchOption = {
  id: string;
  label: string;
  sublabel?: string;
  meta?: string;
  amount?: number;
};

export const ENTITY_SEARCH_DEBOUNCE_MS = 200;
export const ENTITY_SEARCH_GC_MS = 5 * 60_000;

/** Vendor/customer picker metadata — short staleTime is OK for UX. */
export const ENTITY_PARTY_SEARCH_STALE_MS = 60_000;

/** Document pickers (invoices, bills) — fresher hints, server still authoritative on submit. */
export const ENTITY_DOCUMENT_SEARCH_STALE_MS = 15_000;

export function entityLiveSearchQueryKey(scope: string, query: string) {
  return adminQueryKeys.entityLiveSearch(scope, query);
}

type CustomerSearchRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  customer_number: string | null;
};

type VendorSearchRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  contact?: string | null;
  trn?: string | null;
};

function mapCustomerRows(rows: CustomerSearchRow[]): EntitySearchOption[] {
  return rows.map((c) => ({
    id: c.id,
    label: c.name?.trim() || c.email || c.phone || "Unnamed customer",
    sublabel: [c.email, c.phone].filter(Boolean).join(" · ") || undefined,
    meta: c.customer_number ? `Customer #${c.customer_number}` : undefined,
  }));
}

function mapVendorRows(rows: VendorSearchRow[]): EntitySearchOption[] {
  return rows.map((v) => {
    const sublabel =
      [v.email, v.phone ?? v.contact].filter(Boolean).join(" · ") || undefined;
    return {
      id: v.id,
      label: v.name?.trim() || "Unnamed vendor",
      sublabel,
      meta: v.trn ? `TRN ${v.trn}` : undefined,
    };
  });
}

export async function fetchVendorSearchOptions(query: string): Promise<EntitySearchOption[]> {
  const rpcRows = await rpcSearchVendors(query);
  if (rpcRows) {
    return mapVendorRows(rpcRows);
  }

  const res = await adminGet<{
    data: Array<{ id: string; name: string | null }>;
  }>(`vendors?view=search&q=${encodeURIComponent(query)}`);
  return (res.data ?? []).map((v) => ({
    id: v.id,
    label: v.name?.trim() || "Unnamed vendor",
  }));
}

export async function fetchCustomerSearchOptions(query: string): Promise<EntitySearchOption[]> {
  const rpcRows = await rpcSearchCustomers(query.trim());
  if (rpcRows) {
    return mapCustomerRows(rpcRows);
  }

  const trimmed = query.trim();
  const rows = (
    await adminGet<{
      data: CustomerSearchRow[];
    }>(`customers?view=search&q=${encodeURIComponent(trimmed)}`)
  ).data;

  return mapCustomerRows(rows ?? []);
}

/** Authoritative vendor row for committed selection (ERP profile). */
export async function resolveVendorPickerOption(
  vendorId: string,
): Promise<EntitySearchOption> {
  const profile = await adminGet<{
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    trn: string | null;
    is_active: boolean;
  }>(`erp/vendors/${vendorId}?view=profile`);

  if (!profile.is_active) {
    throw new Error("Selected vendor is inactive");
  }

  const sublabel = [profile.email, profile.phone].filter(Boolean).join(" · ") || undefined;
  return {
    id: profile.id,
    label: profile.name?.trim() || "Unnamed vendor",
    sublabel,
    meta: profile.trn ? `TRN ${profile.trn}` : undefined,
  };
}

/** Authoritative customer row for committed selection (ERP profile). */
export async function resolveCustomerPickerOption(
  customerId: string,
): Promise<EntitySearchOption> {
  const res = await adminGet<{
    profile: {
      id: string;
      name: string | null;
      email: string | null;
      phone: string | null;
      customerNumber: string | null;
    };
  }>(`customers/${customerId}/erp`);

  const profile = res.profile;
  return {
    id: profile.id,
    label: profile.name?.trim() || profile.email || profile.phone || "Unnamed customer",
    sublabel: [profile.email, profile.phone].filter(Boolean).join(" · ") || undefined,
    meta: profile.customerNumber ? `Customer #${profile.customerNumber}` : undefined,
  };
}

export function invalidateAdminVendorSearchQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: ["admin", "entity-search", "vendor"] });
}

export async function invalidateAdminVendorCatalogQueries(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["admin", "vendors"] }),
    invalidateAdminVendorSearchQueries(queryClient),
  ]);
}

export function invalidateAdminCustomerSearchQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: ["admin", "entity-search", "customer"] });
}
