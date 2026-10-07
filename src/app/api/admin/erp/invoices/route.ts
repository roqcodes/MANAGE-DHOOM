import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  executeIdempotentOperation,
  idempotentOperationErrorResponse,
} from "@/lib/erp/client-operations/execute-idempotent-operation";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import {
  idempotentSalesInvoiceCreateBodySchema,
  salesInvoiceCreatePayloadSchema,
} from "@/modules/erp/schemas/sales-invoice-api-schemas";
import { createErpInvoice, listErpInvoices } from "@/modules/erp/services/erp-invoices.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(request.url);
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const storeId = searchParams.get("storeId") ?? undefined;
  const userId = searchParams.get("userId") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const search = searchParams.get("search") ?? undefined;
  const dateFrom = searchParams.get("dateFrom") ?? undefined;
  const dateTo = searchParams.get("dateTo") ?? undefined;
  const openOnly = searchParams.get("openOnly") === "1";
  const limit = searchParams.get("limit")
    ? Math.min(50, parseInt(searchParams.get("limit")!, 10))
    : undefined;
  try {
    const result = await listErpInvoices({
      page,
      storeId,
      userId,
      status,
      search,
      dateFrom,
      dateTo,
      openOnly,
      limit,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[GET /api/admin/erp/invoices]", error);
    const msg = error instanceof Error ? error.message : "Failed to list invoices";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();

    const idempotent = idempotentSalesInvoiceCreateBodySchema.safeParse(body);
    if (idempotent.success) {
      const outcome = await executeIdempotentOperation<{
        invoiceId: string;
        invoiceNumber: string | null;
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
          action: "create_invoice",
          entityType: "invoice",
          entityId: outcome.result.invoiceId,
          description: "ERP invoice created (durable sync)",
          storeId: idempotent.data.storeId,
        });
      }

      return NextResponse.json(
        {
          idempotentReplay: outcome.idempotentReplay,
          payloadHash: outcome.payloadHash,
          result: outcome.result,
          id: outcome.result?.invoiceId,
        },
        { status: 201 },
      );
    }

    const direct = salesInvoiceCreatePayloadSchema.safeParse(body);
    if (!direct.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const id = await createErpInvoice({ ...direct.data, storeId: body.storeId });
    return NextResponse.json({ id }, { status: 201 });
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
    const msg = error instanceof Error ? error.message : "Failed to create invoice";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
