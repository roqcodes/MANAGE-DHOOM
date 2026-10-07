import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { createStore, listErpStores } from "@/modules/erp/services/erp-stores.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const search = new URL(request.url).searchParams.get("search") ?? undefined;
  try {
    const data = await listErpStores(search);
    return NextResponse.json({ data });
  } catch (error) {
    console.error("[GET /api/admin/erp/stores]", error);
    return NextResponse.json({ error: "Failed to list stores" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const id = await createStore(body);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to create store";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
