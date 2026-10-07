import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { getLastFiledVatReturn } from "@/modules/erp/services/erp-vat.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const storeId = url.searchParams.get("storeId") ?? undefined;

  try {
    const data = await getLastFiledVatReturn(storeId);
    return NextResponse.json(data);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to load last filed VAT return";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
