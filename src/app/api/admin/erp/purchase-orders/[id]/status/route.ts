import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import { updatePurchaseOrderStatus } from "@/modules/purchase-orders/services/admin-purchase-orders.service";

const patchBodySchema = z.object({
  status: z.enum(["production", "by_sea", "by_air", "in_customs", "received"]),
  expectedDate: z.string().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { id: poId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = patchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { status, expectedDate } = parsed.data;

  try {
    await updatePurchaseOrderStatus(poId, status, expectedDate);

    await logAuditEvent({
      action: "update",
      entityType: "purchase_order",
      entityId: poId,
      description: `PO status updated to ${status}${expectedDate ? ` (expected: ${expectedDate})` : ""}`,
    });

    return NextResponse.json({ ok: true, status });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to update status";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
