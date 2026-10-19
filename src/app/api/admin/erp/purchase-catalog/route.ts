import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { searchPurchaseVariants } from "@/modules/erp/services/erp-purchase-catalog.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const params = new URL(request.url).searchParams;
  const q = params.get("q") ?? "";
  const storeId = params.get("storeId") ?? undefined;
  try {
    const data = await searchPurchaseVariants(q, 25, storeId);
    return NextResponse.json({ data });
  } catch (error) {
    console.error("[GET /api/admin/erp/purchase-catalog]", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
