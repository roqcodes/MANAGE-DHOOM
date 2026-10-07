import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  approveTransferRequest,
  getTransferRequestDetail,
  rejectTransferRequest,
} from "@/modules/erp/services/erp-transfer-requests.service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  try {
    const data = await getTransferRequestDetail(id);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to get transfer request" }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  try {
    const body = await request.json();
    if (body.action === "approve") {
      const transferId = await approveTransferRequest(id);
      return NextResponse.json({ ok: true, transferId });
    }
    if (body.action === "reject") {
      await rejectTransferRequest(id);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Action failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
