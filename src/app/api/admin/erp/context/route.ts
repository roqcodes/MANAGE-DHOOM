import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  getAdminErpShell,
  setActiveStore,
} from "@/modules/erp/services/store-context.service";

export async function GET() {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  try {
    const { context, stores } = await getAdminErpShell();
    return NextResponse.json({ context, stores });
  } catch (error) {
    console.error("[GET /api/admin/erp/context]", error);
    return NextResponse.json({ error: "Failed to load ERP context" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const storeId = body.storeId as string;
    if (!storeId) {
      return NextResponse.json({ error: "storeId is required" }, { status: 400 });
    }
    const context = await setActiveStore(storeId);
    return NextResponse.json({ context });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to set store";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
