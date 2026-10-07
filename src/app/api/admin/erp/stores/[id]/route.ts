import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { getStoreById, updateStore } from "@/modules/erp/services/erp-stores.service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  try {
    const store = await getStoreById(id);
    if (!store) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ store });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to load store";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  try {
    const body = await request.json();
    await updateStore(id, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to update store";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
