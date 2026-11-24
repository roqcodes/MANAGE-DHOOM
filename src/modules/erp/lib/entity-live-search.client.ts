"use client";

import type { QueryClient } from "@tanstack/react-query";

import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import {
  pinWalkingCustomerRows,
  WALKING_CUSTOMER_SEARCH_LABEL,
  WALKING_CUSTOMER_SEARCH_SUBLABEL,
} from "@/modules/customers/lib/walking-customer-search";
import { WALKING_CUSTOMER_ID } from "@/modules/customers/lib/walking-customer";
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
  imageUrl?: string;
  userId?: string;
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
  avatar_url?: string | null;
  current_balance?: number | null;
};

type VendorSearchRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  contact?: string | null;
  trn?: string | null;
  current_balance?: number | null;
};

function mapPartyBalance(value: number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function mapCustomerRows(rows: CustomerSearchRow[]): EntitySearchOption[] {
  return rows.map((c) => ({
    id: c.id,
    label:
      c.id === WALKING_CUSTOMER_ID
        ? WALKING_CUSTOMER_SEARCH_LABEL
        : c.name?.trim() || c.email || c.phone || "Unnamed customer",
    sublabel: [c.email, c.phone].filter(Boolean).join(" · ") || undefined,
    amount: mapPartyBalance(c.current_balance),
    imageUrl: c.avatar_url?.trim() || undefined,
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
      amount: mapPartyBalance(v.current_balance),
    };
  });
}

export async function fetchVendorSearchOptions(query: string): Promise<EntitySearchOption[]> {
  const rpcRows = await rpcSearchVendors(query);
  if (rpcRows) {
    return mapVendorRows(rpcRows);
  }

  const res = await adminGet<{
    data: VendorSearchRow[];
  }>(`vendors?view=search&q=${encodeURIComponent(query)}`);
  return mapVendorRows(res.data ?? []);
}

function pinWalkingCustomerOptions(
  options: EntitySearchOption[],
  query: string,
): EntitySearchOption[] {
  return pinWalkingCustomerRows(options, query, {
    id: WALKING_CUSTOMER_ID,
    label: WALKING_CUSTOMER_SEARCH_LABEL,
    sublabel: WALKING_CUSTOMER_SEARCH_SUBLABEL,
    amount: 0,
  });
}

export async function fetchCustomerSearchOptions(query: string): Promise<EntitySearchOption[]> {
  const trimmed = query.trim();
  const rpcRows = await rpcSearchCustomers(trimmed);
  if (rpcRows) {
    return pinWalkingCustomerOptions(mapCustomerRows(rpcRows), trimmed);
  }

  const rows = (
    await adminGet<{
      data: CustomerSearchRow[];
    }>(`customers?view=search&q=${encodeURIComponent(trimmed)}`)
  ).data;

  return pinWalkingCustomerOptions(mapCustomerRows(rows ?? []), trimmed);
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
    balanceDue?: number;
  }>(`erp/vendors/${vendorId}?view=profile`);

  if (!profile.is_active) {
    throw new Error("Selected vendor is inactive");
  }

  const sublabel = [profile.email, profile.phone].filter(Boolean).join(" · ") || undefined;
  return {
    id: profile.id,
    label: profile.name?.trim() || "Unnamed vendor",
    sublabel,
    amount: mapPartyBalance(profile.balanceDue),
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
      avatarUrl: string | null;
      outstandingBalance?: number;
    };
  }>(`customers/${customerId}/erp?view=profile`);

  const profile = res.profile;
  return {
    id: profile.id,
    label: profile.name?.trim() || profile.email || profile.phone || "Unnamed customer",
    sublabel: [profile.email, profile.phone].filter(Boolean).join(" · ") || undefined,
    amount: mapPartyBalance(profile.outstandingBalance),
    imageUrl: profile.avatarUrl?.trim() || undefined,
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

export async function invalidateAdminCustomerCatalogQueries(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["admin", "customers"] }),
    invalidateAdminCustomerSearchQueries(queryClient),
  ]);
}
