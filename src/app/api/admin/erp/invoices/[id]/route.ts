import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  executeIdempotentOperation,
  idempotentOperationErrorResponse,
} from "@/lib/erp/client-operations/execute-idempotent-operation";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import {
  idempotentSalesInvoiceUpdateBodySchema,
  salesInvoiceUpdatePayloadSchema,
} from "@/modules/erp/schemas/sales-invoice-api-schemas";
import {
  cancelErpInvoice,
  getErpInvoiceDetail,
  getErpInvoiceEditable,
  updateErpInvoice,
} from "@/modules/erp/services/erp-invoices.service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  try {
    const [invoice, editable] = await Promise.all([
      getErpInvoiceDetail(id),
      getErpInvoiceEditable(id),
    ]);
    return NextResponse.json({ ...invoice, editable });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to load invoice";
    const status = msg === "Invoice not found" ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id: routeInvoiceId } = await params;
  try {
    const body = await request.json();

    const idempotent = idempotentSalesInvoiceUpdateBodySchema.safeParse(body);
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
          action: "update",
          entityType: "invoice",
          entityId: outcome.result.invoiceId,
          description: "ERP invoice updated (durable sync)",
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

    const direct = salesInvoiceUpdatePayloadSchema.safeParse({
      ...body,
      invoiceId: routeInvoiceId,
    });
    if (!direct.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { invoiceId, ...rest } = direct.data;
    await updateErpInvoice(invoiceId, rest);
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
    const msg = error instanceof Error ? error.message : "Failed to update invoice";
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
    await cancelErpInvoice(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to cancel invoice";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
