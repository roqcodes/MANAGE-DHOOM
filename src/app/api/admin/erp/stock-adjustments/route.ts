import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  createStockAdjustment,
  listStockAdjustments,
} from "@/modules/erp/services/erp-stock-adjustments.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(request.url);
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  try {
    const result = await listStockAdjustments(page, 20, {
      storeId: searchParams.get("storeId") ?? undefined,
      search: searchParams.get("search") ?? undefined,
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Failed to list adjustments" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const id = await createStockAdjustment(body);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to create adjustment";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
