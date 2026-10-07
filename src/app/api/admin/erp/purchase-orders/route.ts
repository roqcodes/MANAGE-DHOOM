import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  executeIdempotentOperation,
  idempotentOperationErrorResponse,
} from "@/lib/erp/client-operations/execute-idempotent-operation";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import {
  createErpPurchaseOrder,
  listErpPurchaseOrders,
} from "@/modules/erp/services/erp-purchase-orders.service";
import { idempotentPurchaseOrderCreateBodySchema } from "@/modules/erp/schemas/purchase-api-schemas";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const status = searchParams.get("status") ?? undefined;
  const vendorId = searchParams.get("vendorId") ?? undefined;
  const storeId = searchParams.get("storeId") ?? undefined;
  const search = searchParams.get("search") ?? undefined;
  const dateFrom = searchParams.get("dateFrom") ?? undefined;
  const dateTo = searchParams.get("dateTo") ?? undefined;

  try {
    const result = await listErpPurchaseOrders({
      page,
      status,
      vendorId,
      storeId,
      search,
      dateFrom,
      dateTo,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[GET /api/admin/erp/purchase-orders]", error);
    return NextResponse.json({ error: "Failed to list purchase orders" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();

    const idempotent = idempotentPurchaseOrderCreateBodySchema.safeParse(body);
    if (idempotent.success) {
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
          action: "create",
          entityType: "purchase_order",
          entityId: outcome.result.poId,
          description: `ERP purchase order ${outcome.result.poNumber ?? outcome.result.poId} created`,
          storeId: idempotent.data.storeId,
        });
      }

      return NextResponse.json(
        {
          idempotentReplay: outcome.idempotentReplay,
          payloadHash: outcome.payloadHash,
          result: outcome.result,
          id: outcome.result?.poId,
        },
        { status: 201 },
      );
    }

    const id = await createErpPurchaseOrder(body);
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
    const msg = error instanceof Error ? error.message : "Failed to create purchase order";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
