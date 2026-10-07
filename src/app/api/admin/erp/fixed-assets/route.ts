import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  createFixedAsset,
  listFixedAssets,
} from "@/modules/erp/services/erp-fixed-assets.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(request.url);
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const storeId = searchParams.get("storeId") || null;
  const search = searchParams.get("search") || null;
  try {
    const result = await listFixedAssets(page, 30, storeId, search);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Failed to list assets" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const id = await createFixedAsset(body);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to create asset";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
