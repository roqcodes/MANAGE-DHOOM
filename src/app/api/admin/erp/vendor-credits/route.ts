import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  createVendorCredit,
  listVendorCredits,
} from "@/modules/erp/services/erp-vendor-credits.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const page = Math.max(0, parseInt(new URL(request.url).searchParams.get("page") ?? "0", 10));
  const storeId = new URL(request.url).searchParams.get("storeId") ?? undefined;
  try {
    const result = await listVendorCredits(page, 20, storeId);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[GET /api/admin/erp/vendor-credits]", error);
    return NextResponse.json({ error: "Failed to list vendor credits" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const id = await createVendorCredit(body);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to create vendor credit";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
