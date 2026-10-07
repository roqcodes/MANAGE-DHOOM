import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  finalizeStockAdjustment,
  getStockAdjustmentDetail,
} from "@/modules/erp/services/erp-stock-adjustments.service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  try {
    const data = await getStockAdjustmentDetail(id);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to get adjustment" }, { status: 500 });
  }
}

export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  try {
    await finalizeStockAdjustment(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to finalize";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
