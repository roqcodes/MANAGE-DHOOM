import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  approveStoreTransfer,
  completeStoreTransfer,
  getStoreTransferDetail,
  recordTransferPayment,
} from "@/modules/erp/services/erp-store-transfers.service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  try {
    const data = await getStoreTransferDetail(id);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to get transfer" }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const action = new URL(request.url).searchParams.get("action");
  try {
    if (action === "approve") {
      await approveStoreTransfer(id);
      return NextResponse.json({ ok: true });
    }
    if (action === "complete") {
      await completeStoreTransfer(id);
      return NextResponse.json({ ok: true });
    }
    if (action === "payment") {
      const body = await request.json();
      const paymentId = await recordTransferPayment({ ...body, transferId: id });
      return NextResponse.json({ id: paymentId }, { status: 201 });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Action failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
