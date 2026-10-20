import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { listErpSalesmen } from "@/modules/users/services/erp-salesmen.service";

export async function GET() {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  try {
    const salesmen = await listErpSalesmen();
    return NextResponse.json({ salesmen });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to list salesmen";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
