import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  executeIdempotentOperation,
  idempotentOperationErrorResponse,
} from "@/lib/erp/client-operations/execute-idempotent-operation";
import { buildAuditUpdateEvent } from "@/modules/erp/lib/audit-change-summary";
import {
  PURCHASE_BILL_AUDIT_FIELD_LABELS,
  purchaseBillAuditSnapshotFromDetail,
} from "@/modules/erp/lib/document-audit-snapshots";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import {
  cancelPurchaseBill,
  finalizePurchaseBill,
  getPurchaseBillDetail,
  updateDraftPurchaseBill,
} from "@/modules/erp/services/erp-purchase-bills.service";
import { listAuditLogsForEntity } from "@/modules/erp/services/audit-log.service";
import {
  idempotentPurchaseBillFinalizeBodySchema,
  idempotentPurchaseBillUpdateBodySchema,
  purchaseBillFinalizePayloadSchema,
} from "@/modules/erp/schemas/purchase-api-schemas";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  try {
    const data = await getPurchaseBillDetail(id);
    const auditLogs = await listAuditLogsForEntity("purchase_bill", id);
    return NextResponse.json({ bill: data, auditLogs });
  } catch (error) {
    console.error("[GET /api/admin/erp/purchase-bills/[id]]", error);
    return NextResponse.json({ error: "Failed to get purchase bill" }, { status: 500 });
  }
}

export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id: routeBillId } = await context.params;
  try {
    const body = await _request.json().catch(() => ({}));

    const idempotent = idempotentPurchaseBillFinalizeBodySchema.safeParse(body);
    if (idempotent.success) {
      if (idempotent.data.payload.billId !== routeBillId) {
        return NextResponse.json(
          { error: "Bill id in payload does not match URL", code: "VALIDATION" },
          { status: 400 },
        );
      }

      const outcome = await executeIdempotentOperation<{
        billId: string;
        status: string;
      }>({
        operationId: idempotent.data.operationId,
        operationType: idempotent.data.operationType,
        payload: (body as { payload: unknown }).payload,
        payloadHash: idempotent.data.payloadHash,
        storeId: idempotent.data.storeId,
        terminalId: idempotent.data.terminalId,
      });

      if (!outcome.idempotentReplay && outcome.result?.billId) {
        await logAuditEvent({
          action: "finalize_purchase_bill",
          entityType: "purchase_bill",
          entityId: outcome.result.billId,
          description: "Purchase bill finalized (durable sync)",
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

    const direct = purchaseBillFinalizePayloadSchema.safeParse({ billId: routeBillId });
    if (!direct.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    await finalizePurchaseBill(routeBillId);
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
    const msg = error instanceof Error ? error.message : "Failed to finalize purchase bill";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  try {
    await cancelPurchaseBill(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to cancel purchase bill";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id: routeBillId } = await context.params;
  try {
    const body = await request.json();

    const idempotent = idempotentPurchaseBillUpdateBodySchema.safeParse(body);
    if (idempotent.success) {
      if (idempotent.data.payload.billId !== routeBillId) {
        return NextResponse.json(
          { error: "Bill id in payload does not match URL", code: "VALIDATION" },
          { status: 400 },
        );
      }

      const beforeDetail = await getPurchaseBillDetail(routeBillId);
      const beforeSnapshot = purchaseBillAuditSnapshotFromDetail(beforeDetail);

      const outcome = await executeIdempotentOperation<{ billId: string }>({
        operationId: idempotent.data.operationId,
        operationType: idempotent.data.operationType,
        payload: (body as { payload: unknown }).payload,
        payloadHash: idempotent.data.payloadHash,
        storeId: idempotent.data.storeId,
        terminalId: idempotent.data.terminalId,
      });

      if (!outcome.idempotentReplay && outcome.result?.billId) {
        const afterDetail = await getPurchaseBillDetail(outcome.result.billId);
        const afterSnapshot = purchaseBillAuditSnapshotFromDetail(afterDetail);
        await logAuditEvent(
          buildAuditUpdateEvent({
            action: "update",
            entityType: "purchase_bill",
            entityId: outcome.result.billId,
            storeId: idempotent.data.storeId,
            headline: "Purchase bill draft updated",
            syncNote: "(durable sync)",
            before: beforeSnapshot,
            after: afterSnapshot,
            fieldLabels: PURCHASE_BILL_AUDIT_FIELD_LABELS,
          }),
        );
      }

      return NextResponse.json({
        idempotentReplay: outcome.idempotentReplay,
        payloadHash: outcome.payloadHash,
        result: outcome.result,
        ok: true,
      });
    }

    await updateDraftPurchaseBill(routeBillId, body);
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
    const msg = error instanceof Error ? error.message : "Failed to update purchase bill";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
