import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { getLineProductContext } from "@/modules/erp/services/erp-line-product-context.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get("storeId") ?? undefined;
  const customerId = searchParams.get("customerId") ?? undefined;
  const vendorId = searchParams.get("vendorId") ?? undefined;
  const productIds = (searchParams.get("productIds") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (!storeId || productIds.length === 0) {
    return NextResponse.json(
      { error: "storeId and productIds are required" },
      { status: 400 },
    );
  }

  try {
    const data = await getLineProductContext({
      storeId,
      productIds,
      customerId,
      vendorId,
    });
    return NextResponse.json({ data });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Failed to load line context";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
