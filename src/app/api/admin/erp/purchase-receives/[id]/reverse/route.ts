import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { reversePurchaseReceive } from "@/modules/erp/services/erp-purchase-receives.service";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  try {
    const body = await request.json().catch(() => ({}));
    const reversalId = await reversePurchaseReceive(id, body.reason ?? null);
    return NextResponse.json({ reversalId });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to reverse purchase receive";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
