import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  executeIdempotentOperation,
  idempotentOperationErrorResponse,
} from "@/lib/erp/client-operations/execute-idempotent-operation";
import { notifyOrderStatusChange, notifyWalletEvent } from "@/modules/admin/services/push-notifications.service";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import {
  idempotentSalesOrderCancelBodySchema,
  salesOrderCancelPayloadSchema,
} from "@/modules/orders/schemas/sales-order-api-schemas";
import { cancelSalesOrder } from "@/modules/orders/services/cancel-sales-order.service";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { id: routeOrderId } = await context.params;

  try {
    const body = await request.json().catch(() => ({}));

    const idempotent = idempotentSalesOrderCancelBodySchema.safeParse(body);
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
        status: string;
        inventoryRestored?: boolean;
        walletRefunded?: boolean;
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
          action: "cancel",
          entityType: "sales_order",
          entityId: outcome.result.orderId,
          description: `Sales order ${outcome.result.salesOrderNumber ?? outcome.result.orderId} cancelled`,
          storeId: idempotent.data.storeId,
        });
        await notifyOrderStatusChange(outcome.result.orderId, "cancelled").catch(
          () => undefined,
        );
        if (outcome.result.walletRefunded) {
          const supabase = await createSupabaseServerClient();
          const { data: orderRow } = await supabase
            .from("orders")
            .select("user_id, total_amount")
            .eq("id", outcome.result.orderId)
            .maybeSingle();
          if (orderRow?.user_id) {
            await notifyWalletEvent({
              userId: orderRow.user_id,
              eventKey: "wallet.credited",
              amount: Number(orderRow.total_amount ?? 0),
              reference: `Refund for ${outcome.result.orderId.slice(0, 8).toUpperCase()}`,
            }).catch(() => undefined);
          }
        }
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

    const direct = salesOrderCancelPayloadSchema.safeParse({
      orderId: (body as { orderId?: string }).orderId ?? routeOrderId,
    });
    if (!direct.success || direct.data.orderId !== routeOrderId) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const result = await cancelSalesOrder(routeOrderId, (body as { storeId?: string }).storeId);
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
    const msg = error instanceof Error ? error.message : "Failed to cancel sales order";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
