import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  getVendorCatalogStats,
  getVendors,
  getVendorsErp,
  insertVendor,
  searchActiveVendors,
} from "@/modules/vendors/services/vendors.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const view = searchParams.get("view");
  const search = searchParams.get("search") ?? undefined;
  const vendorType = searchParams.get("vendorType") ?? undefined;

  if (view === "search") {
    const q = searchParams.get("q") ?? "";
    const data = await searchActiveVendors(q);
    return NextResponse.json({ data });
  }

  if (view === "erp") {
    const [{ data, total }, stats] = await Promise.all([
      getVendorsErp(page, { search, vendorType }),
      getVendorCatalogStats(),
    ]);
    return NextResponse.json({ data, total, page, stats });
  }

  const [{ data, total }, stats] = await Promise.all([
    getVendors(page, { search }),
    getVendorCatalogStats(),
  ]);

  return NextResponse.json({ data, total, page, stats });
}

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const id = await insertVendor(body);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to create vendor";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

