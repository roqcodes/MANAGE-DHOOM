import { NextResponse } from "next/server";
import { z } from "zod";

import type { OrderStatusFilter } from "@/common/admin/types";
import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  executeIdempotentOperation,
  idempotentOperationErrorResponse,
} from "@/lib/erp/client-operations/execute-idempotent-operation";
import { notifyOrderStatusChange } from "@/modules/admin/services/push-notifications.service";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import { createSalesOrder } from "@/modules/orders/services/create-sales-order.service";
import {
  idempotentSalesOrderCreateBodySchema,
  salesOrderPayloadSchema,
} from "@/modules/orders/schemas/sales-order-api-schemas";
import { getOrders, getOrdersCatalogStats } from "@/modules/orders/services/orders.service";

const STATUSES: OrderStatusFilter[] = [
  "all",
  "pending",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
];

function parseStatus(s: string | null): OrderStatusFilter {
  if (s && (STATUSES as string[]).includes(s)) return s as OrderStatusFilter;
  return "all";
}

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const status = parseStatus(searchParams.get("status"));
  const rawUser = searchParams.get("userId")?.trim();
  const userId = rawUser && rawUser.length > 0 ? rawUser : null;
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const storeId = searchParams.get("storeId") ?? undefined;

  const [{ data, total }, stats] = await Promise.all([
    getOrders(status, userId, page, "erp", storeId),
    getOrdersCatalogStats("erp", storeId),
  ]);

  return NextResponse.json({
    data,
    total,
    page,
    status,
    userId,
    filterUsers: [],
    stats,
  });
}

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();

    const idempotent = idempotentSalesOrderCreateBodySchema.safeParse(body);
    if (idempotent.success) {
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
          action: "create",
          entityType: "sales_order",
          entityId: outcome.result.orderId,
          description: `Sales order ${outcome.result.salesOrderNumber ?? outcome.result.orderId}`,
          storeId: idempotent.data.storeId,
        });
        await notifyOrderStatusChange(outcome.result.orderId, "processing").catch(
          () => undefined,
        );
      }
      return NextResponse.json(
        {
          idempotentReplay: outcome.idempotentReplay,
          payloadHash: outcome.payloadHash,
          result: outcome.result,
        },
        { status: 201 },
      );
    }

    const direct = salesOrderPayloadSchema
      .extend({ storeId: z.string().uuid().optional() })
      .safeParse(body);
    if (!direct.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const result = await createSalesOrder({ ...direct.data, storeId: body.storeId });
    return NextResponse.json(result, { status: 201 });
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
    const msg = error instanceof Error ? error.message : "Failed to create sales order";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
