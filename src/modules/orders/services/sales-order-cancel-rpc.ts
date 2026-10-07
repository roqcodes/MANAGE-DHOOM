import type { SupabaseClient } from "@supabase/supabase-js";

import { invokeRpc } from "@/lib/integrations/supabase/rpc";
import type { SalesOrderCancelPayload } from "@/modules/orders/types/sales-order-cancel-payload";

export type SalesOrderCancelRpcResult = {
  orderId: string;
  salesOrderNumber: string;
  status: string;
  inventoryRestored: boolean;
  walletRefunded: boolean;
};

export async function cancelSalesOrderViaRpc(
  supabase: SupabaseClient,
  storeId: string,
  payload: SalesOrderCancelPayload,
): Promise<SalesOrderCancelRpcResult> {
  const { data, error } = await invokeRpc(
    supabase,
    "erp_cancel_sales_order_from_payload",
    {
      p_payload: payload as Record<string, unknown>,
      p_store_id: storeId,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  if (!data || typeof data !== "object") {
    throw new Error("Sales order cancel returned empty response");
  }

  const row = data as {
    orderId?: string;
    salesOrderNumber?: string;
    status?: string;
    inventoryRestored?: boolean;
    walletRefunded?: boolean;
  };

  if (!row.orderId) {
    throw new Error("Sales order cancel missing orderId");
  }

  return {
    orderId: row.orderId,
    salesOrderNumber: row.salesOrderNumber ?? row.orderId,
    status: row.status ?? "cancelled",
    inventoryRestored: Boolean(row.inventoryRestored),
    walletRefunded: Boolean(row.walletRefunded),
  };
}
