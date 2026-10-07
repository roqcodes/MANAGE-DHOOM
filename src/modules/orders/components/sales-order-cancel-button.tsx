"use client";

import { useMemo, useState, useTransition } from "react";
import { RotateCcw } from "lucide-react";

import type { OrderWithItems } from "@/common/admin/types";
import { getCurrencySymbol } from "@/lib/format-currency";
import { createSupabaseBrowserClient } from "@/lib/integrations/supabase/client";
import { ERP_CLIENT_OPERATION_TYPES } from "@/lib/erp/client-operations/operation-types";
import { dispatchOutboxChanged } from "@/lib/sync/outbox-browser-events";
import { broadcastSyncWake } from "@/lib/sync/sync-network";
import { getOrCreateErpTerminalId } from "@/lib/sync/erp-terminal-id";
import { createOutboxStore } from "@/lib/sync/outbox-store";
import { OutboxEnqueueError } from "@/lib/sync/outbox-errors";
import { resolveOutboxUserId } from "@/lib/sync/resolve-outbox-user-id.client";
import { usePendingSalesOrderCreates } from "@/lib/sync/hooks/use-pending-sales-order-creates";
import { useErpStores } from "@/modules/erp/components/use-erp-stores";
import { salesOrderResourceScope } from "@/modules/orders/types/sales-order-update-payload";
import {
  isPaid,
  isRefunded,
  shortOrderRef,
} from "@/modules/orders/components/orders-ui";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type SalesOrderCancelButtonProps = {
  order: OrderWithItems;
  disabled?: boolean;
  onQueued?: () => void;
  onError?: (message: string) => void;
};

export function SalesOrderCancelButton({
  order,
  disabled,
  onQueued,
  onError,
}: SalesOrderCancelButtonProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [localNotice, setLocalNotice] = useState<string | null>(null);
  const outbox = usePendingSalesOrderCreates();
  const { activeStoreId } = useErpStores();

  const cancelPending = useMemo(
    () =>
      [...outbox.pending, ...outbox.syncing].some(
        (op) =>
          op.operationType === ERP_CLIENT_OPERATION_TYPES.salesOrder.cancel &&
          (op.payload as { orderId?: string })?.orderId === order.id,
      ),
    [outbox.pending, outbox.syncing, order.id],
  );

  const paid = isPaid(order.payment_status);
  const refunded = isRefunded(order.payment_status);
  const total = order.total_amount ?? 0;
  const symbol = getCurrencySymbol();

  function handleConfirm() {
    const storeId = order.store_id ?? activeStoreId;
    if (!storeId) {
      onError?.("This sales order has no store assigned.");
      return;
    }

    startTransition(async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const staffUserId = await resolveOutboxUserId(supabase);
        if (!staffUserId) {
          onError?.("You must be signed in to cancel this sales order.");
          return;
        }

        const store = createOutboxStore();
        try {
          await store.enqueue({
            operationType: ERP_CLIENT_OPERATION_TYPES.salesOrder.cancel,
            schemaVersion: 1,
            payload: { orderId: order.id },
            userId: staffUserId,
            storeId,
            terminalId: getOrCreateErpTerminalId(),
            resourceScope: salesOrderResourceScope(order.id),
          });
        } catch (enqueueErr) {
          if (enqueueErr instanceof OutboxEnqueueError) {
            onError?.(enqueueErr.message);
          } else {
            onError?.(
              enqueueErr instanceof Error
                ? enqueueErr.message
                : "Could not save cancellation locally.",
            );
          }
          return;
        } finally {
          await store.close();
        }

        dispatchOutboxChanged();
        broadcastSyncWake();
        setLocalNotice("Cancellation pending sync");
        setOpen(false);
        onQueued?.();
      } catch (err) {
        onError?.(err instanceof Error ? err.message : "Failed to queue cancellation");
      }
    });
  }

  return (
    <>
      {localNotice || cancelPending ? (
        <span className="text-xs text-muted-foreground" role="status">
          {cancelPending ? "Cancelling…" : localNotice}
        </span>
      ) : null}
      <Button
        variant="outline"
        size="sm"
        disabled={disabled || pending || cancelPending}
        onClick={() => setOpen(true)}
      >
        <RotateCcw data-icon="inline-start" />
        Cancel order
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel sales order?</DialogTitle>
            <DialogDescription>
              {paid && !refunded
                ? `This will cancel order ${shortOrderRef(order.id)} and refund ${symbol}${total.toFixed(2)} to the customer wallet when synced. Stock will be restored.`
                : `This will cancel order ${shortOrderRef(order.id)} when synchronized. Stock will be restored.`}
              {" "}
              If you are offline, the cancellation is saved locally and sent when you reconnect.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Keep order
            </Button>
            <Button type="button" variant="destructive" onClick={handleConfirm} disabled={pending}>
              {pending ? "Saving locally…" : "Queue cancellation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
