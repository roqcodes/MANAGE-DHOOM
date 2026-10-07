import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { getTransferStatementSummary } from "@/modules/erp/services/erp-transfer-payments.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(request.url);
  const fromStoreId = searchParams.get("fromStoreId");
  if (!fromStoreId) {
    return NextResponse.json({ error: "fromStoreId is required" }, { status: 400 });
  }
  try {
    const summary = await getTransferStatementSummary({
      fromStoreId,
      toStoreId: searchParams.get("toStoreId"),
      fromDate: searchParams.get("fromDate"),
      toDate: searchParams.get("toDate"),
    });
    return NextResponse.json(summary);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to load statement";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
