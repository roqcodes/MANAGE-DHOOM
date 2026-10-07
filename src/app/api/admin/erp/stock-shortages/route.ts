import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { listStoreStockShortages } from "@/modules/erp/services/erp-stock-shortages.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get("storeId");

  try {
    const data = await listStoreStockShortages(storeId);
    return NextResponse.json({ data });
  } catch (error) {
    console.error("stock-shortages:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load shortages" },
      { status: 400 },
    );
  }
}
