import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { verifyErpSalesmanPin } from "@/modules/users/services/erp-salesmen.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const pin = new URL(request.url).searchParams.get("pin")?.trim() ?? "";
  if (!/^\d{3}$/.test(pin)) {
    return NextResponse.json({ salesman: null });
  }

  try {
    const salesman = await verifyErpSalesmanPin(pin);
    return NextResponse.json({ salesman });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Verification failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
