import "server-only";

import { notifyOrderStatusChange, notifyWalletEvent } from "@/modules/admin/services/push-notifications.service";
import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import { requireErpStoreId } from "@/modules/erp/services/store-context.service";
import { cancelSalesOrderViaRpc } from "@/modules/orders/services/sales-order-cancel-rpc";

export async function cancelSalesOrder(
  orderId: string,
  storeId?: string,
): Promise<{
  orderId: string;
  salesOrderNumber: string;
  status: string;
}> {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) throw new Error("Unauthorized");

  const supabase = await createSupabaseServerClient();

  let resolvedStoreId = storeId;
  if (!resolvedStoreId) {
    const { data: orderRow, error } = await supabase
      .from("orders")
      .select("store_id, source")
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!orderRow || orderRow.source !== "sales_order") {
      throw new Error("Sales order not found.");
    }
    resolvedStoreId = orderRow.store_id ?? undefined;
  }

  const effectiveStoreId = await requireErpStoreId(resolvedStoreId);

  const result = await cancelSalesOrderViaRpc(supabase, effectiveStoreId, { orderId });

  await logAuditEvent({
    action: "cancel",
    entityType: "sales_order",
    entityId: result.orderId,
    description: `Sales order ${result.salesOrderNumber} cancelled`,
    storeId: effectiveStoreId,
  });

  await notifyOrderStatusChange(result.orderId, "cancelled").catch(() => undefined);

  if (result.walletRefunded) {
    const { data: orderRow } = await supabase
      .from("orders")
      .select("user_id, total_amount")
      .eq("id", orderId)
      .maybeSingle();
    if (orderRow?.user_id) {
      await notifyWalletEvent({
        userId: orderRow.user_id,
        eventKey: "wallet.credited",
        amount: Number(orderRow.total_amount ?? 0),
        reference: `Refund for ${orderId.slice(0, 8).toUpperCase()}`,
      }).catch(() => undefined);
    }
  }

  return {
    orderId: result.orderId,
    salesOrderNumber: result.salesOrderNumber,
    status: result.status,
  };
}
