import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  finalizeOpeningStock,
  getOpeningStockDetail,
} from "@/modules/erp/services/erp-opening-stock.service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  try {
    const data = await getOpeningStockDetail(id);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to get opening stock" }, { status: 500 });
  }
}

export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  try {
    await finalizeOpeningStock(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to finalize";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}