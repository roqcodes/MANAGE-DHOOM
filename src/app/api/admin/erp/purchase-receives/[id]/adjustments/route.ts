import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { getPurchaseReceiveAdjustments } from "@/modules/erp/services/erp-purchase-receives.service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  try {
    const adjustments = await getPurchaseReceiveAdjustments(id);
    return NextResponse.json({ adjustments });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to load adjustments";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
