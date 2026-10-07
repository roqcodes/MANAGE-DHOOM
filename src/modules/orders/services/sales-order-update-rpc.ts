import type { SupabaseClient } from "@supabase/supabase-js";

import { invokeRpc } from "@/lib/integrations/supabase/rpc";
import type { SalesOrderUpdatePayload } from "@/modules/orders/types/sales-order-update-payload";
import type { SalesOrderCreateRpcResult } from "@/modules/orders/services/sales-order-create-rpc";

export async function updateSalesOrderViaRpc(
  supabase: SupabaseClient,
  storeId: string,
  payload: SalesOrderUpdatePayload,
): Promise<SalesOrderCreateRpcResult> {
  const { data, error } = await invokeRpc(
    supabase,
    "erp_update_sales_order_from_payload",
    {
      p_payload: payload as Record<string, unknown>,
      p_store_id: storeId,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  if (!data || typeof data !== "object") {
    throw new Error("Sales order update returned empty response");
  }

  const row = data as { orderId?: string; salesOrderNumber?: string };
  if (!row.orderId) {
    throw new Error("Sales order update missing orderId");
  }

  return {
    orderId: row.orderId,
    salesOrderNumber: row.salesOrderNumber ?? row.orderId,
  };
}
