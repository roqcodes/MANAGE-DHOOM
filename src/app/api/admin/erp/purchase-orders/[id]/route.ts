import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  executeIdempotentOperation,
  idempotentOperationErrorResponse,
} from "@/lib/erp/client-operations/execute-idempotent-operation";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import {
  getErpPurchaseOrderDetail,
  updateErpPurchaseOrder,
} from "@/modules/erp/services/erp-purchase-orders.service";
import { listAuditLogsForEntity } from "@/modules/erp/services/audit-log.service";
import { idempotentPurchaseOrderUpdateBodySchema } from "@/modules/erp/schemas/purchase-api-schemas";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  try {
    const po = await getErpPurchaseOrderDetail(id);
    if (!po) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const auditLogs = await listAuditLogsForEntity("purchase_order", id);
    return NextResponse.json({ po, auditLogs });
  } catch (error) {
    console.error("[GET /api/admin/erp/purchase-orders/[id]]", error);
    return NextResponse.json({ error: "Failed to get purchase order" }, { status: 500 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id: routePoId } = await context.params;
  try {
    const body = await request.json();

    const idempotent = idempotentPurchaseOrderUpdateBodySchema.safeParse(body);
    if (idempotent.success) {
      if (idempotent.data.payload.poId !== routePoId) {
        return NextResponse.json(
          { error: "Purchase order id in payload does not match URL", code: "VALIDATION" },
          { status: 400 },
        );
      }

      const outcome = await executeIdempotentOperation<{
        poId: string;
        poNumber: string;
      }>({
        operationId: idempotent.data.operationId,
        operationType: idempotent.data.operationType,
        payload: (body as { payload: unknown }).payload,
        payloadHash: idempotent.data.payloadHash,
        storeId: idempotent.data.storeId,
        terminalId: idempotent.data.terminalId,
      });

      if (!outcome.idempotentReplay && outcome.result?.poId) {
        await logAuditEvent({
          action: "update",
          entityType: "purchase_order",
          entityId: outcome.result.poId,
          description: `Purchase order ${outcome.result.poNumber ?? outcome.result.poId} updated`,
          storeId: idempotent.data.storeId,
        });
      }

      return NextResponse.json({
        idempotentReplay: outcome.idempotentReplay,
        payloadHash: outcome.payloadHash,
        result: outcome.result,
        ok: true,
      });
    }

    await updateErpPurchaseOrder(routePoId, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const mapped = idempotentOperationErrorResponse(error);
    if (
      error instanceof Error &&
      (error.name === "ErpClientOperationError" ||
        error.name === "ErpClientOperationConflictError" ||
        error.message.includes("ERP_CLIENT"))
    ) {
      return NextResponse.json(mapped.body, { status: mapped.status });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const msg = error instanceof Error ? error.message : "Failed to update purchase order";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
