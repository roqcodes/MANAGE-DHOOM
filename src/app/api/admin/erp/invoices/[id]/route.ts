import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  executeIdempotentOperation,
  idempotentOperationErrorResponse,
} from "@/lib/erp/client-operations/execute-idempotent-operation";
import { buildAuditUpdateEvent } from "@/modules/erp/lib/audit-change-summary";
import {
  SALES_INVOICE_AUDIT_FIELD_LABELS,
  salesInvoiceAuditSnapshotFromDetail,
} from "@/modules/erp/lib/document-audit-snapshots";
import {
  salesPersonIdFromPayload,
  withSalesmanDocumentAudit,
} from "@/modules/erp/lib/log-sales-document-audit";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import {
  idempotentSalesInvoiceUpdateBodySchema,
  salesInvoiceUpdatePayloadSchema,
} from "@/modules/erp/schemas/sales-invoice-api-schemas";
import {
  cancelErpInvoice,
  fetchErpInvoiceDetail,
  updateErpInvoice,
} from "@/modules/erp/services/erp-invoices.service";

function invoiceAuditSnapshotFromFetched(detail: Awaited<ReturnType<typeof fetchErpInvoiceDetail>>) {
  return salesInvoiceAuditSnapshotFromDetail({
    ...detail,
    users: detail.users,
    invoice_items: detail.invoice_items,
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  try {
    const invoice = await fetchErpInvoiceDetail(id);
    return NextResponse.json(invoice);
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

      const beforeDetail = await fetchErpInvoiceDetail(routeInvoiceId);
      const beforeSnapshot = invoiceAuditSnapshotFromFetched(beforeDetail);

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
        const afterDetail = await fetchErpInvoiceDetail(outcome.result.invoiceId);
        const afterSnapshot = invoiceAuditSnapshotFromFetched(afterDetail);
        const salesPersonId = salesPersonIdFromPayload(idempotent.data.payload);
        await logAuditEvent(
          withSalesmanDocumentAudit(
            "invoice",
            salesPersonId,
            buildAuditUpdateEvent({
              action: "update",
              entityType: "invoice",
              entityId: outcome.result.invoiceId,
              storeId: idempotent.data.storeId,
              headline: "ERP invoice updated",
              syncNote: "(durable sync)",
              before: beforeSnapshot,
              after: afterSnapshot,
              fieldLabels: SALES_INVOICE_AUDIT_FIELD_LABELS,
            }),
          ),
        );
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
