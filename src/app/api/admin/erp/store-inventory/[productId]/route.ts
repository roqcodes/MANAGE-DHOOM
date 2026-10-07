import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { getStoreInventoryProductDetail } from "@/modules/erp/services/erp-store-inventory-analytics.service";

export async function GET(
  request: Request,
  context: { params: Promise<{ productId: string }> },
) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { productId } = await context.params;
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get("storeId");

  try {
    const data = await getStoreInventoryProductDetail(productId, storeId);
    return NextResponse.json({ data });
  } catch (error) {
    console.error("store-inventory detail:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load detail" },
      { status: 400 },
    );
  }
}
