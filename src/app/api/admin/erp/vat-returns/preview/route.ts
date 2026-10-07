import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { previewVatReturn } from "@/modules/erp/services/erp-vat.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const storeId = url.searchParams.get("storeId") ?? undefined;
  const periodStart = url.searchParams.get("periodStart") ?? "";
  const periodEnd = url.searchParams.get("periodEnd") ?? "";

  if (!periodStart || !periodEnd) {
    return NextResponse.json({ error: "Period dates are required." }, { status: 400 });
  }

  try {
    const preview = await previewVatReturn({ storeId, periodStart, periodEnd });
    return NextResponse.json(preview);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to preview VAT return";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
