import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  cancelEstimate,
  getEstimateDetail,
  isEstimateEditable,
  updateEstimate,
} from "@/modules/erp/services/erp-estimates.service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  try {
    const estimate = await getEstimateDetail(id);
    return NextResponse.json({
      ...estimate,
      editable: isEstimateEditable(estimate.status),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to load estimate";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  try {
    const body = await request.json();
    await updateEstimate(id, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to update estimate";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  try {
    await cancelEstimate(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to cancel estimate";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
