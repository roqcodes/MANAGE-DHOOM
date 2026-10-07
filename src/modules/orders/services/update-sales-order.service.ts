import "server-only";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import { requireErpStoreId } from "@/modules/erp/services/store-context.service";
import { updateSalesOrderViaRpc } from "@/modules/orders/services/sales-order-update-rpc";
import type { SalesOrderUpdatePayload } from "@/modules/orders/types/sales-order-update-payload";

export type UpdateSalesOrderInput = SalesOrderUpdatePayload & {
  storeId?: string;
};

export async function updateSalesOrder(input: UpdateSalesOrderInput): Promise<{
  orderId: string;
  salesOrderNumber: string;
}> {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) throw new Error("Unauthorized");

  const supabase = await createSupabaseServerClient();
  const storeId = await requireErpStoreId(input.storeId);

  const { orderId, salesOrderNumber } = await updateSalesOrderViaRpc(supabase, storeId, {
    orderId: input.orderId,
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
  });

  await logAuditEvent({
    action: "update",
    entityType: "sales_order",
    entityId: orderId,
    description: `Sales order ${salesOrderNumber} updated`,
    storeId,
  });

  return { orderId, salesOrderNumber };
}
