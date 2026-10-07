import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  executeIdempotentOperation,
  idempotentOperationErrorResponse,
} from "@/lib/erp/client-operations/execute-idempotent-operation";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import { convertSalesOrderToInvoice } from "@/modules/erp/services/erp-conversions.service";
import { idempotentSalesOrderConvertBodySchema } from "@/modules/orders/schemas/sales-order-api-schemas";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { id: routeOrderId } = await context.params;

  try {
    const body = await request.json().catch(() => ({}));

    const idempotent = idempotentSalesOrderConvertBodySchema.safeParse(body);
    if (idempotent.success) {
      if (idempotent.data.payload.orderId !== routeOrderId) {
        return NextResponse.json(
          { error: "Order id in payload does not match URL", code: "VALIDATION" },
          { status: 400 },
        );
      }

      const outcome = await executeIdempotentOperation<{
        orderId: string;
        invoiceId: string;
        invoiceNumber: string | null;
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
          action: "convert_to_invoice",
          entityType: "sales_order",
          entityId: outcome.result.orderId,
          description: "Sales order converted to invoice",
          storeId: idempotent.data.storeId,
        });
      }

      return NextResponse.json(
        {
          idempotentReplay: outcome.idempotentReplay,
          payloadHash: outcome.payloadHash,
          result: outcome.result,
          invoiceId: outcome.result?.invoiceId,
        },
        { status: 200 },
      );
    }

    const invoiceId = await convertSalesOrderToInvoice(routeOrderId);
    return NextResponse.json({ invoiceId });
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
    const msg = error instanceof Error ? error.message : "Conversion failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
