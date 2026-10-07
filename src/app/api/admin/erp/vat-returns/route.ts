import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  createVatReturn,
  getVatReturnDetail,
  listVatReturns,
} from "@/modules/erp/services/erp-vat.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const page = Math.max(0, parseInt(url.searchParams.get("page") ?? "0", 10));
  const storeId = url.searchParams.get("storeId") ?? undefined;
  const search = url.searchParams.get("search") ?? undefined;

  try {
    const result = await listVatReturns({ page, storeId, search });
    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to list VAT returns";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const id = await createVatReturn(body);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to create VAT return";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
