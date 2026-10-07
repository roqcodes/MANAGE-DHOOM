import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  executeIdempotentOperation,
  idempotentOperationErrorResponse,
} from "@/lib/erp/client-operations/execute-idempotent-operation";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import { submitPoDeliveryAndFinalize } from "@/modules/erp/services/erp-purchase-orders.service";
import {
  idempotentPurchaseOrderDeliverFinalizeBodySchema,
  purchaseOrderDeliverFinalizePayloadSchema,
} from "@/modules/erp/schemas/purchase-api-schemas";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id: routePoId } = await context.params;
  try {
    const body = await request.json();

    const idempotent = idempotentPurchaseOrderDeliverFinalizeBodySchema.safeParse(body);
    if (idempotent.success) {
      if (idempotent.data.payload.poId !== routePoId) {
        return NextResponse.json(
          { error: "Purchase order id in payload does not match URL", code: "VALIDATION" },
          { status: 400 },
        );
      }

      const outcome = await executeIdempotentOperation<{
        poId: string;
        receiveId: string;
        billId: string;
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
          action: "submit_delivery",
          entityType: "purchase_order",
          entityId: outcome.result.poId,
          description: "Delivery submitted and invoice finalized (durable sync)",
          storeId: idempotent.data.storeId,
        });
      }

      return NextResponse.json({
        idempotentReplay: outcome.idempotentReplay,
        payloadHash: outcome.payloadHash,
        result: outcome.result,
        receiveId: outcome.result?.receiveId,
        billId: outcome.result?.billId,
      });
    }

    const direct = purchaseOrderDeliverFinalizePayloadSchema.safeParse({
      ...body,
      poId: routePoId,
    });
    if (!direct.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const result = await submitPoDeliveryAndFinalize({
      poId: routePoId,
      receiveDate: direct.data.receiveDate,
      notes: direct.data.notes ?? null,
      lines: direct.data.lines,
    });
    return NextResponse.json(result);
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
    const msg = error instanceof Error ? error.message : "Failed to submit delivery";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
