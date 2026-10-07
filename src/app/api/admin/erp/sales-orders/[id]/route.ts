import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { ERP_CLIENT_OPERATION_TYPES } from "@/lib/erp/client-operations/operation-types";
import {
  executeIdempotentOperation,
  idempotentOperationErrorResponse,
} from "@/lib/erp/client-operations/execute-idempotent-operation";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import {
  idempotentSalesOrderUpdateBodySchema,
  salesOrderUpdatePayloadSchema,
} from "@/modules/orders/schemas/sales-order-api-schemas";
import { getSalesOrderDetail } from "@/modules/orders/services/sales-order-detail.service";
import { updateSalesOrder } from "@/modules/orders/services/update-sales-order.service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  try {
    const result = await getSalesOrderDetail(id);
    if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[GET /api/admin/erp/sales-orders/[id]]", error);
    return NextResponse.json({ error: "Failed to load sales order" }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { id: routeOrderId } = await context.params;

  try {
    const body = await request.json();

    const idempotent = idempotentSalesOrderUpdateBodySchema.safeParse(body);
    if (idempotent.success) {
      if (idempotent.data.payload.orderId !== routeOrderId) {
        return NextResponse.json(
          { error: "Order id in payload does not match URL", code: "VALIDATION" },
          { status: 400 },
        );
      }

      const outcome = await executeIdempotentOperation<{
        orderId: string;
        salesOrderNumber: string;
      }>({
        operationId: idempotent.data.operationId,
        operationType: idempotent.data.operationType,
        payload: (body as { payload: unknown }).payload,
        payloadHash: idempotent.data.payloadHash,
        storeId: idempotent.data.storeId,
        terminalId: idempotent.data.terminalId,
      });

      if (!outcome.idempotentReplay && outcome.result?.orderId) {
        await logAuditEvent({
          action: "update",
          entityType: "sales_order",
          entityId: outcome.result.orderId,
          description: `Sales order ${outcome.result.salesOrderNumber ?? outcome.result.orderId} updated`,
          storeId: idempotent.data.storeId,
        });
      }

      return NextResponse.json(
        {
          idempotentReplay: outcome.idempotentReplay,
          payloadHash: outcome.payloadHash,
          result: outcome.result,
        },
        { status: 200 },
      );
    }

    const direct = salesOrderUpdatePayloadSchema.safeParse({
      ...body,
      orderId: body.orderId ?? routeOrderId,
    });
    if (!direct.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    if (direct.data.orderId !== routeOrderId) {
      return NextResponse.json({ error: "Order id mismatch" }, { status: 400 });
    }

    const { orderId: _ignored, ...createFields } = direct.data;
    const result = await updateSalesOrder({
      ...createFields,
      orderId: routeOrderId,
      storeId: body.storeId,
    });
    return NextResponse.json(result, { status: 200 });
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
    const msg = error instanceof Error ? error.message : "Failed to update sales order";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
