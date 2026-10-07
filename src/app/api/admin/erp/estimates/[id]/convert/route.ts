import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { convertEstimateToInvoice } from "@/modules/erp/services/erp-estimates.service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  try {
    const invoiceId = await convertEstimateToInvoice(id);
    return NextResponse.json({ invoiceId }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to convert estimate";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
