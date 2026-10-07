import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  getStoreStockForProduct,
  getStoreStockForVariant,
} from "@/modules/erp/services/erp-stock-details.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get("storeId");
  const productId = searchParams.get("productId");
  const variantId = searchParams.get("variantId");

  if (!storeId || (!productId && !variantId)) {
    return NextResponse.json(
      { error: "storeId and productId (or variantId) required" },
      { status: 400 },
    );
  }

  try {
    const stock = productId
      ? await getStoreStockForProduct(storeId, productId)
      : await getStoreStockForVariant(storeId, variantId!);
    return NextResponse.json({ stock });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to get stock";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
