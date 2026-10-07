import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { getPaymentDetail } from "@/modules/erp/services/erp-payments.service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  try {
    const payment = await getPaymentDetail(id);
    return NextResponse.json(payment);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to load payment";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
