import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { getBulkPaymentBatchDetail } from "@/modules/erp/services/erp-supplier-payments.service";

type RouteContext = { params: Promise<{ batchId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { batchId } = await context.params;
  try {
    const data = await getBulkPaymentBatchDetail(batchId);
    return NextResponse.json(data);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to get bulk payment";
    return NextResponse.json({ error: msg }, { status: 404 });
  }
}
