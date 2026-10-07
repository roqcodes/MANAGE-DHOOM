import type { SupabaseClient } from "@supabase/supabase-js";

import { invokeRpc } from "@/lib/integrations/supabase/rpc";
import type { SalesOrderCreatePayload } from "@/modules/orders/types/sales-order-create-payload";

export type SalesOrderCreateRpcResult = {
  orderId: string;
  salesOrderNumber: string;
};

export async function createSalesOrderViaRpc(
  supabase: SupabaseClient,
  storeId: string,
  payload: SalesOrderCreatePayload,
): Promise<SalesOrderCreateRpcResult> {
  const { data, error } = await invokeRpc(
    supabase,
    "erp_create_sales_order_from_payload",
    {
      p_payload: payload as Record<string, unknown>,
      p_store_id: storeId,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  if (!data || typeof data !== "object") {
    throw new Error("Sales order create returned empty response");
  }

  const row = data as { orderId?: string; salesOrderNumber?: string };
  if (!row.orderId) {
    throw new Error("Sales order create missing orderId");
  }

  return {
    orderId: row.orderId,
    salesOrderNumber: row.salesOrderNumber ?? row.orderId,
  };
}
