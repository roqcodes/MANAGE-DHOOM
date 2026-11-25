import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  getOpeningStockWorksheet,
  saveOpeningStockLine,
  saveOpeningStockWorksheet,
} from "@/modules/erp/services/erp-opening-stock.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get("storeId");
  if (!storeId) {
    return NextResponse.json({ error: "storeId is required" }, { status: 400 });
  }
  try {
    const data = await getOpeningStockWorksheet(
      storeId,
      searchParams.get("search") ?? undefined,
    );
    return NextResponse.json(data);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to load worksheet";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    if (body.productId) {
      const result = await saveOpeningStockLine(body);
      return NextResponse.json(result);
    }
    const result = await saveOpeningStockWorksheet(body);
    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Save failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}