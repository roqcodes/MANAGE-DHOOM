"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { formatDistanceToNow } from "date-fns";
import { Building2, Package, Truck } from "lucide-react";

import type { OrderFulfillment, OrderWithItems } from "@/common/admin/types";
import { StatusBadge } from "@/modules/admin/components/status-badge";
import { StoreSelect, useErpStores } from "@/modules/erp/components/use-erp-stores";
import {
  assignOrderFulfillmentStoreAction,
  shipAllOrderFulfillmentsAction,
  shipOrderFulfillmentAction,
} from "@/modules/orders/actions/order-fulfillment.actions";
import {
  InventoryFulfillmentStatusPill,
  shortOrderRef,
} from "@/modules/orders/components/orders-ui";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function isOnlineOrder(order: OrderWithItems) {
  return !order.source || order.source === "online";
}

function FulfillmentItemsTable({ fulfillment }: { fulfillment: OrderFulfillment }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border/60">
      <table className="min-w-full text-xs">
        <thead className="bg-muted/40 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-2 py-1.5">Item</th>
            <th className="px-2 py-1.5 text-right">Qty</th>
            <th className="px-2 py-1.5 text-right">Reserved</th>
            <th className="px-2 py-1.5 text-right">Shipped</th>
          </tr>
        </thead>
        <tbody>
          {fulfillment.items.map((item) => (
            <tr key={item.id} className="border-t border-border/40">
              <td className="px-2 py-1.5">{item.product_name ?? item.variant_id}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{item.quantity}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {item.reserved_quantity}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {item.shipped_quantity}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OrderFulfillmentPanel({
  order,
  onUpdated,
}: {
  order: OrderWithItems;
  onUpdated: () => void | Promise<void>;
}) {
  const { stores } = useErpStores();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [assignStoreId, setAssignStoreId] = useState("");

  const online = isOnlineOrder(order);
  const fulfillments = order.fulfillments ?? [];
  const needsAssignment = order.fulfillment_status === "pending_assignment";
  const hasUnshipped = fulfillments.some(
    (f) => f.status === "reserved" || f.status === "processing",
  );

  const pendingFulfillment = useMemo(
    () => fulfillments.find((f) => f.status === "pending_assignment"),
    [fulfillments],
  );

  if (!online) {
    return (
      <Card className="border border-border ring-0">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <Building2 className="size-4" />
            Store fulfillment
          </CardTitle>
          <CardDescription>
            POS and sales orders deduct stock immediately at the assigned store.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4 text-sm text-muted-foreground">
          This order source is <span className="font-medium">{order.source}</span>.
          Inventory was committed at order placement.
        </CardContent>
      </Card>
    );
  }

  function runAction(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        await onUpdated();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed.");
      }
    });
  }

  return (
    <Card className="border border-border ring-0">
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Package className="size-4" />
              Inventory fulfillment
            </CardTitle>
            <CardDescription className="mt-1">
              Phase 8: reserve at order, ship to deduct physical stock.
            </CardDescription>
          </div>
          {order.fulfillment_status ? (
            <InventoryFulfillmentStatusPill status={order.fulfillment_status} />
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-4">
        {error ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        {order.inventory_reserved ? (
          <p className="text-sm text-muted-foreground">
            Stock is reserved across{" "}
            <span className="font-medium text-foreground">
              {fulfillments.length} shipment{fulfillments.length === 1 ? "" : "s"}
            </span>
            .
          </p>
        ) : needsAssignment ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Assign a fulfilling store before confirming shipment. Multiple stores
            may be needed if the order spans warehouses.
          </p>
        ) : null}

        {needsAssignment && pendingFulfillment ? (
          <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-4">
            <p className="text-sm font-medium">Assign fulfilling store</p>
            <div className="flex flex-wrap items-end gap-3">
              <StoreSelect
                value={assignStoreId}
                onChange={setAssignStoreId}
                stores={stores}
                label="Store"
              />
              <Button
                size="sm"
                disabled={isPending || !assignStoreId}
                onClick={() =>
                  runAction(() =>
                    assignOrderFulfillmentStoreAction(order.id, assignStoreId),
                  )
                }
              >
                Assign & reserve stock
              </Button>
            </div>
          </div>
        ) : null}

        {fulfillments.length > 0 ? (
          <div className="flex flex-col gap-3">
            {fulfillments.map((fulfillment, index) => (
              <div
                key={fulfillment.id}
                className="rounded-lg border border-border/60 bg-muted/10 p-3"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">
                      Shipment {index + 1}
                    </span>
                    <StatusBadge status={fulfillment.status} />
                    {fulfillment.store_name ? (
                      <span className="text-xs text-muted-foreground">
                        @ {fulfillment.store_name}
                      </span>
                    ) : null}
                  </div>
                  {fulfillment.status === "reserved" ||
                  fulfillment.status === "processing" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() =>
                        runAction(() =>
                          shipOrderFulfillmentAction(order.id, fulfillment.id),
                        )
                      }
                    >
                      <Truck data-icon="inline-start" />
                      Ship this shipment
                    </Button>
                  ) : null}
                </div>
                {fulfillment.reserved_at ? (
                  <p className="mb-2 text-[11px] text-muted-foreground">
                    Reserved{" "}
                    {formatDistanceToNow(new Date(fulfillment.reserved_at), {
                      addSuffix: true,
                    })}
                    {fulfillment.shipped_at
                      ? ` · Shipped ${format(new Date(fulfillment.shipped_at), "MMM d, h:mm a")}`
                      : ""}
                  </p>
                ) : null}
                <FulfillmentItemsTable fulfillment={fulfillment} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No fulfillment records yet. They are created when the order is placed
            or edited.
          </p>
        )}

        {hasUnshipped && !needsAssignment ? (
          <div className="flex justify-end border-t pt-3">
            <Button
              size="sm"
              disabled={isPending}
              onClick={() =>
                runAction(() => shipAllOrderFulfillmentsAction(order.id))
              }
            >
              <Truck data-icon="inline-start" />
              Ship all pending
            </Button>
          </div>
        ) : null}

        <p className="text-[11px] text-muted-foreground">
          Order #{shortOrderRef(order.id)} ·{" "}
          <Link href="/admin/erp/fulfillment-queue" className="text-primary hover:underline">
            Open fulfillment queue
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
