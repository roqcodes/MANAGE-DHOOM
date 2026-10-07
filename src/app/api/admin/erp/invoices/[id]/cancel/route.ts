import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  executeIdempotentOperation,
  idempotentOperationErrorResponse,
} from "@/lib/erp/client-operations/execute-idempotent-operation";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import { idempotentSalesInvoiceCancelBodySchema } from "@/modules/erp/schemas/sales-invoice-api-schemas";
import { cancelErpInvoice } from "@/modules/erp/services/erp-invoices.service";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { id: routeInvoiceId } = await context.params;

  try {
    const body = await request.json().catch(() => ({}));

    const idempotent = idempotentSalesInvoiceCancelBodySchema.safeParse(body);
    if (idempotent.success) {
      if (idempotent.data.payload.invoiceId !== routeInvoiceId) {
        return NextResponse.json(
          { error: "Invoice id in payload does not match URL", code: "VALIDATION" },
          { status: 400 },
        );
      }

      const outcome = await executeIdempotentOperation<{
        invoiceId: string;
        status: string;
      }>({
        operationId: idempotent.data.operationId,
        operationType: idempotent.data.operationType,
        payload: (body as { payload: unknown }).payload,
        payloadHash: idempotent.data.payloadHash,
        storeId: idempotent.data.storeId,
        terminalId: idempotent.data.terminalId,
      });

      if (!outcome.idempotentReplay && outcome.result?.invoiceId) {
        await logAuditEvent({
          action: "cancel",
          entityType: "invoice",
          entityId: outcome.result.invoiceId,
          description: "ERP invoice cancelled (durable sync)",
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

    await cancelErpInvoice(routeInvoiceId);
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
    const msg = error instanceof Error ? error.message : "Failed to cancel invoice";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
