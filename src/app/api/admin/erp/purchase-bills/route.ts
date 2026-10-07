import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  executeIdempotentOperation,
  idempotentOperationErrorResponse,
} from "@/lib/erp/client-operations/execute-idempotent-operation";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import {
  createPurchaseBill,
  listPurchaseBills,
} from "@/modules/erp/services/erp-purchase-bills.service";
import { idempotentPurchaseBillCreateBodySchema } from "@/modules/erp/schemas/purchase-api-schemas";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const page = Math.max(0, parseInt(new URL(request.url).searchParams.get("page") ?? "0", 10));
  const status = new URL(request.url).searchParams.get("status") ?? undefined;
  const storeId = new URL(request.url).searchParams.get("storeId") ?? undefined;
  const vendorId = new URL(request.url).searchParams.get("vendorId") ?? undefined;
  const search = new URL(request.url).searchParams.get("search") ?? undefined;
  const dateFrom = new URL(request.url).searchParams.get("dateFrom") ?? undefined;
  const dateTo = new URL(request.url).searchParams.get("dateTo") ?? undefined;
  const openOnly = new URL(request.url).searchParams.get("openOnly") === "1";
  const limit = Math.min(
    100,
    Math.max(1, parseInt(new URL(request.url).searchParams.get("limit") ?? "20", 10)),
  );
  try {
    const result = await listPurchaseBills({
      page,
      limit,
      status,
      storeId,
      vendorId,
      search,
      dateFrom,
      dateTo,
      openOnly,
    });
    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to list purchase bills";
    console.error("[GET /api/admin/erp/purchase-bills]", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();

    const idempotent = idempotentPurchaseBillCreateBodySchema.safeParse(body);
    if (idempotent.success) {
      const outcome = await executeIdempotentOperation<{
        billId: string;
        billNumber: string;
        finalized?: boolean;
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
          action: outcome.result.finalized ? "finalize_purchase_bill" : "create_purchase_bill",
          entityType: "purchase_bill",
          entityId: outcome.result.billId,
          description: outcome.result.finalized
            ? "Purchase bill created and finalized (durable sync)"
            : "Purchase bill created (durable sync)",
          storeId: idempotent.data.storeId,
        });
      }

      return NextResponse.json(
        {
          idempotentReplay: outcome.idempotentReplay,
          payloadHash: outcome.payloadHash,
          result: outcome.result,
          id: outcome.result?.billId,
        },
        { status: 201 },
      );
    }

    const id = await createPurchaseBill(body);
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
    const msg = error instanceof Error ? error.message : "Failed to create purchase bill";
    console.error("[POST /api/admin/erp/purchase-bills]", error);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
