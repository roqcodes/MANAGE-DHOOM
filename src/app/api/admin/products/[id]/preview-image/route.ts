import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { getProductPrimaryImageUrl } from "@/modules/products/services/product-media.service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  try {
    const fullUrl = await getProductPrimaryImageUrl(id);
    return NextResponse.json({ fullUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load image";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
