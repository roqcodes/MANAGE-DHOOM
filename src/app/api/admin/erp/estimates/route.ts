import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { createEstimate, listEstimates } from "@/modules/erp/services/erp-estimates.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const page = Math.max(0, parseInt(new URL(request.url).searchParams.get("page") ?? "0", 10));
  const storeId = new URL(request.url).searchParams.get("storeId") ?? undefined;
  try {
    const result = await listEstimates(page, 20, storeId);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[GET /api/admin/erp/estimates]", error);
    const msg = error instanceof Error ? error.message : "Failed to list estimates";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const id = await createEstimate(body);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to create estimate";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
