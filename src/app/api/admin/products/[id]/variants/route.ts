import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { listProductVariantsForAllocation } from "@/modules/products/services/ensure-default-product-variant.service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const url = new URL(_request.url);
  const ensureDefault = url.searchParams.get("ensureDefault") !== "false";

  try {
    const data = await listProductVariantsForAllocation(id, ensureDefault);
    if (ensureDefault && data.length === 0) {
      return NextResponse.json(
        { error: "Could not create or load an online SKU for this product." },
        { status: 400 },
      );
    }
    return NextResponse.json({ data });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Could not create default online SKU";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
