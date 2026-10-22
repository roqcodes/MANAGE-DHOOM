import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  getStoreStockForProduct,
  getStoreStockForProducts,
  getStoreStockForVariant,
} from "@/modules/erp/services/erp-stock-details.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get("storeId");
  const productId = searchParams.get("productId");
  const productIds = searchParams.get("productIds")?.split(",").filter(Boolean) ?? [];
  const variantId = searchParams.get("variantId");

  if (!storeId || (!productId && !variantId && productIds.length === 0)) {
    return NextResponse.json(
      { error: "storeId and productId (or productIds or variantId) required" },
      { status: 400 },
    );
  }

  try {
    if (productIds.length > 0) {
      const stocks = await getStoreStockForProducts(storeId, productIds);
      return NextResponse.json({ stocks });
    }
    const stock = productId
      ? await getStoreStockForProduct(storeId, productId)
      : await getStoreStockForVariant(storeId, variantId!);
    return NextResponse.json({ stock });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to get stock";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
