import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  deleteBulkCustomerPaymentBatch,
  getBulkCustomerPaymentBatchDetail,
} from "@/modules/erp/services/erp-payments.service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { batchId } = await params;

  try {
    const data = await getBulkCustomerPaymentBatchDetail(batchId);
    return NextResponse.json(data);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to load bulk payment";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { batchId } = await params;

  try {
    await deleteBulkCustomerPaymentBatch(batchId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to delete bulk payment";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
