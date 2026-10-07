import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  cancelPurchaseReceive,
  finalizePurchaseReceive,
  getPurchaseReceiveDetail,
} from "@/modules/erp/services/erp-purchase-receives.service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  try {
    const receive = await getPurchaseReceiveDetail(id);
    return NextResponse.json({ receive });
  } catch (error) {
    console.error("[GET /api/admin/erp/purchase-receives/[id]]", error);
    return NextResponse.json({ error: "Failed to get purchase receive" }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  try {
    const body = await request.json().catch(() => ({}));
    await finalizePurchaseReceive(id, body.reconcileBill ?? true);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to finalize purchase receive";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  try {
    await cancelPurchaseReceive(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to cancel purchase receive";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
