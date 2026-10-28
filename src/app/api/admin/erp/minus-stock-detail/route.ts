import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { getMinusStockDetail } from "@/modules/erp/services/erp-minus-stock-detail.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const storeId = params.get("storeId");
  const productId = params.get("productId");

  if (!productId?.trim()) {
    return NextResponse.json({ error: "productId is required" }, { status: 400 });
  }

  try {
    const data = await getMinusStockDetail(storeId, productId.trim());
    return NextResponse.json(data);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to load minus stock detail";
    const status = msg.includes("not on minus stock") ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
