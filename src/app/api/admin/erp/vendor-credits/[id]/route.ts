import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  applyVendorCredit,
  deleteDraftVendorCredit,
  finalizeVendorCredit,
  getVendorCreditDetail,
  updateDraftVendorCredit,
} from "@/modules/erp/services/erp-vendor-credits.service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  try {
    const data = await getVendorCreditDetail(id);
    return NextResponse.json(data);
  } catch (error) {
    console.error("[GET /api/admin/erp/vendor-credits/[id]]", error);
    return NextResponse.json({ error: "Failed to get vendor credit" }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  try {
    const body = await request.json().catch(() => ({}));
    if (body.billId) {
      await applyVendorCredit({
        creditId: id,
        billId: body.billId,
        amount: body.amount,
      });
    } else {
      await finalizeVendorCredit(id, { reduceStock: body.reduceStock ?? false });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to process vendor credit";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  try {
    const body = await request.json();
    await updateDraftVendorCredit(id, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to update vendor credit";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  try {
    await deleteDraftVendorCredit(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to delete vendor credit";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
