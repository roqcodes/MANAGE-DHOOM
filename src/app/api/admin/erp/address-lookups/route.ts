import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  createCustomerAddressLookup,
  searchCustomerAddressLookups,
  type AddressLookupKind,
} from "@/modules/customers/services/customer-address-lookup.service";

function parseKind(value: string | null): AddressLookupKind | null {
  if (value === "city" || value === "mall" || value === "street") return value;
  return null;
}

function parseUuid(value: string | null): string | null {
  if (!value?.trim()) return null;
  return value.trim();
}

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const kind = parseKind(searchParams.get("kind"));
    if (!kind) {
      return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
    }
    const q = searchParams.get("q") ?? "";
    const cityId = parseUuid(searchParams.get("cityId"));
    const streetId = parseUuid(searchParams.get("streetId"));
    const data = await searchCustomerAddressLookups(kind, q, { cityId, streetId });
    return NextResponse.json({ data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Search failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as {
      kind?: string;
      name?: string;
      cityId?: string | null;
      streetId?: string | null;
    };
    const kind = parseKind(body.kind ?? null);
    if (!kind) {
      return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
    }
    const row = await createCustomerAddressLookup(kind, body.name ?? "", {
      cityId: body.cityId ?? null,
      streetId: body.streetId ?? null,
    });
    return NextResponse.json({ row }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Could not save";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
