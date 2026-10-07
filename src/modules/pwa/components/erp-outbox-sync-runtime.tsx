"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { createSupabaseBrowserClient } from "@/lib/integrations/supabase/client";
import { ERP_CLIENT_OPERATION_TYPES } from "@/lib/erp/client-operations/operation-types";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import type { SalesOrderCancelPayload } from "@/modules/orders/types/sales-order-cancel-payload";
import type { SalesOrderUpdatePayload } from "@/modules/orders/types/sales-order-update-payload";
import { OperationHandlerRegistry } from "@/lib/sync/operation-handler";
import { OutboxSyncRuntime } from "@/lib/sync/outbox-sync-runtime";
import { registerErpSyncHandlers } from "@/lib/sync/handlers/register-erp-sync-handlers";
import { resolveOutboxUserId } from "@/lib/sync/resolve-outbox-user-id.client";
function createErpHandlerRegistry(): OperationHandlerRegistry {
  const registry = new OperationHandlerRegistry();
  registerErpSyncHandlers(registry);
  return registry;
}

export function ErpOutboxSyncRuntime() {
  const queryClient = useQueryClient();

  const getCurrentUserId = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    return resolveOutboxUserId(supabase);
  }, []);

  const handlers = useMemo(() => createErpHandlerRegistry(), []);

  const onOperationCommitted = useCallback(
    (operation: { operationType: string; payload?: unknown }) => {
      if (
        operation.operationType === ERP_CLIENT_OPERATION_TYPES.salesOrder.create ||
        operation.operationType === ERP_CLIENT_OPERATION_TYPES.salesOrder.update ||
        operation.operationType === ERP_CLIENT_OPERATION_TYPES.salesOrder.cancel ||
        operation.operationType === ERP_CLIENT_OPERATION_TYPES.salesOrder.convertToInvoice
      ) {
        void queryClient.invalidateQueries({
          queryKey: ["admin", "sales-orders"],
        });
      }
      if (
        operation.operationType === ERP_CLIENT_OPERATION_TYPES.salesOrder.convertToInvoice
      ) {
        const orderId = (operation.payload as { orderId?: string } | undefined)?.orderId;
        if (orderId) {
          void queryClient.invalidateQueries({
            queryKey: adminQueryKeys.orderDetail(orderId),
          });
        }
        void queryClient.invalidateQueries({ queryKey: ["admin", "erp", "invoices"] });
      }
      if (
        operation.operationType === ERP_CLIENT_OPERATION_TYPES.salesInvoice.create ||
        operation.operationType === ERP_CLIENT_OPERATION_TYPES.salesInvoice.update ||
        operation.operationType === ERP_CLIENT_OPERATION_TYPES.salesInvoice.issue ||
        operation.operationType === ERP_CLIENT_OPERATION_TYPES.salesInvoice.cancel
      ) {
        void queryClient.invalidateQueries({ queryKey: ["admin", "erp", "invoices"] });
      }
      if (
        operation.operationType === ERP_CLIENT_OPERATION_TYPES.purchaseOrder.create ||
        operation.operationType === ERP_CLIENT_OPERATION_TYPES.purchaseOrder.update ||
        operation.operationType === ERP_CLIENT_OPERATION_TYPES.purchaseOrder.deliverFinalize
      ) {
        void queryClient.invalidateQueries({ queryKey: ["admin", "purchase-orders"] });
        void queryClient.invalidateQueries({ queryKey: ["admin", "erp", "purchase-orders"] });
      }
      if (
        operation.operationType === ERP_CLIENT_OPERATION_TYPES.purchaseOrder.deliverFinalize
      ) {
        const poId = (operation.payload as { poId?: string } | undefined)?.poId;
        if (poId) {
          void queryClient.invalidateQueries({
            queryKey: ["admin", "erp", "purchase-orders", poId],
          });
        }
        void queryClient.invalidateQueries({ queryKey: ["admin", "erp", "purchase-bills"] });
      }
      if (
        operation.operationType === ERP_CLIENT_OPERATION_TYPES.purchaseBill.create ||
        operation.operationType === ERP_CLIENT_OPERATION_TYPES.purchaseBill.update ||
        operation.operationType === ERP_CLIENT_OPERATION_TYPES.purchaseBill.finalize ||
        operation.operationType === ERP_CLIENT_OPERATION_TYPES.purchaseBill.cancel
      ) {
        void queryClient.invalidateQueries({ queryKey: ["admin", "erp", "purchase-bills"] });
      }
      if (
        operation.operationType === ERP_CLIENT_OPERATION_TYPES.salesOrder.update ||
        operation.operationType === ERP_CLIENT_OPERATION_TYPES.salesOrder.cancel
      ) {
        const orderId =
          operation.operationType === ERP_CLIENT_OPERATION_TYPES.salesOrder.cancel
            ? (operation.payload as SalesOrderCancelPayload | undefined)?.orderId
            : (operation.payload as SalesOrderUpdatePayload | undefined)?.orderId;
        if (orderId) {
          void queryClient.invalidateQueries({
            queryKey: adminQueryKeys.orderDetail(orderId),
          });
        }
      }
    },
    [queryClient],
  );

  return (
    <OutboxSyncRuntime
      getCurrentUserId={getCurrentUserId}
      handlers={handlers}
      onOperationCommitted={onOperationCommitted}
    />
  );
}
