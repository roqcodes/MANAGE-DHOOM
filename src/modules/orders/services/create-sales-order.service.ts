import "server-only";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { notifyOrderStatusChange } from "@/modules/admin/services/push-notifications.service";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import { requireErpStoreId } from "@/modules/erp/services/store-context.service";
import { createSalesOrderViaRpc } from "@/modules/orders/services/sales-order-create-rpc";
import type { SalesOrderCreatePayload } from "@/modules/orders/types/sales-order-create-payload";

export type CreateSalesOrderInput = SalesOrderCreatePayload & {
  storeId?: string;
};

export async function createSalesOrder(input: CreateSalesOrderInput): Promise<{
  orderId: string;
  salesOrderNumber: string;
}> {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) throw new Error("Unauthorized");

  const supabase = await createSupabaseServerClient();
  const storeId = await requireErpStoreId(input.storeId);

  const { orderId, salesOrderNumber: soNumber } = await createSalesOrderViaRpc(
    supabase,
    storeId,
    {
      userId: input.userId,
      referenceNumber: input.referenceNumber,
      shipmentDate: input.shipmentDate,
      deliveryMethod: input.deliveryMethod,
      salesPersonId: input.salesPersonId,
      estimateId: input.estimateId,
      subtotal: input.subtotal,
      tax: input.tax,
      discount: input.discount,
      totalAmount: input.totalAmount,
      taxInclusive: input.taxInclusive,
      items: input.items,
    },
  );

  await logAuditEvent({
    action: "create",
    entityType: "sales_order",
    entityId: orderId,
    description: `Sales order ${soNumber}`,
    storeId: storeId ?? undefined,
  });

  await notifyOrderStatusChange(orderId, "processing").catch(() => undefined);

  return { orderId, salesOrderNumber: soNumber };
}
