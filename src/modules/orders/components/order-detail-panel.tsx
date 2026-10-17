"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import {
  ChevronDown,
  Download,
  ExternalLink,
  Mail,
  MapPin,
  MessageSquare,
  Pencil,
  Phone,
  Printer,
  RotateCcw,
  Store,
  Truck,
  User,
} from "lucide-react";

import type { OrderStatus, OrderWithItems } from "@/common/admin/types";
import { currencyLabel, getCurrencySymbol } from "@/lib/format-currency";
import {
  cancelOrderAndRefundAction,
  updateOrderDetailsAction,
  updateOrderStatusAction,
} from "@/modules/orders/actions/orders.actions";
import { AdminBreadcrumb } from "@/modules/admin/components/admin-breadcrumb";
import { OrderEditModal } from "@/modules/orders/components/order-edit-modal";
import { SalesOrderCancelButton } from "@/modules/orders/components/sales-order-cancel-button";
import { OrderFulfillmentPanel } from "@/modules/orders/components/order-fulfillment-panel";
import { OrderLineItemsList } from "@/modules/orders/components/order-line-items-list";
import { AddressMapEmbed } from "@/modules/admin/components/address-map-embed";
import { textareaCls } from "@/modules/admin/components/modal";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import { createSupabaseBrowserClient } from "@/lib/integrations/supabase/client";
import { ERP_CLIENT_OPERATION_TYPES } from "@/lib/erp/client-operations/operation-types";
import { dispatchOutboxChanged } from "@/lib/sync/outbox-browser-events";
import { resolveOutboxUserId } from "@/lib/sync/resolve-outbox-user-id.client";
import { broadcastSyncWake } from "@/lib/sync/sync-network";
import { getOrCreateErpTerminalId } from "@/lib/sync/erp-terminal-id";
import { createOutboxStore } from "@/lib/sync/outbox-store";
import { OutboxEnqueueError } from "@/lib/sync/outbox-errors";
import { adminPost } from "@/modules/admin/lib/admin-api-client";
import { salesOrderResourceScope } from "@/modules/orders/types/sales-order-update-payload";
import {
  CustomerEditedPill,
  formatAddressLine,
  formatInr,
  fulfillmentActionLabel,
  FulfillmentPill,
  getNextFulfillmentStatus,
  InventoryFulfillmentStatusPill,
  isCancelled,
  isCustomerEditedOrder,
  isPaid,
  isPaymentNotRequired,
  isRefunded,
  ORDER_FULFILLMENT_FLOW,
  PaymentPill,
  shortOrderRef,
} from "@/modules/orders/components/orders-ui";
import { CustomerAvatar } from "@/modules/customers/components/customers-ui";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { computeOrderPaymentSummary } from "@/modules/orders/lib/order-payment-summary";
import { Separator } from "@/components/ui/separator";
import { formatErpDocRef } from "@/lib/erp-document-ref";
import { useAdminAlert } from "@/modules/admin/components/admin-alert-provider";

function TimelineAvatar({ label }: { label: string }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
      {label}
    </span>
  );
}

function buildTimeline(order: OrderWithItems, total: number) {
  const events: {
    id: string;
    title: string;
    detail: string;
    at: string | null;
    icon: string;
  }[] = [
    {
      id: "created",
      title: "Order placed",
      detail: `Order #${shortOrderRef(order.id)} was created.`,
      at: order.created_at,
      icon: "BH",
    },
  ];

  if (order.merchant_note?.trim()) {
    events.splice(1, 0, {
      id: "merchant-note",
      title: "Note for merchant",
      detail: order.merchant_note.trim(),
      at: order.created_at,
      icon: "✎",
    });
  }

  if (isRefunded(order.payment_status)) {
    events.push({
      id: "refunded",
      title: "Cancelled & refunded",
      detail: `${formatInr(total)} returned to customer wallet.`,
      at: order.created_at,
      icon: "↩",
    });
  } else if (isPaid(order.payment_status)) {
    events.push({
      id: "payment",
      title: "Payment captured",
      detail: `${formatInr(total)} paid via DHOOM wallet.`,
      at: order.created_at,
      icon: getCurrencySymbol(),
    });
  } else if (isPaymentNotRequired(order.payment_status)) {
    events.push({
      id: "payment-not-required",
      title: "No payment required",
      detail: "Order placed without wallet payment.",
      at: order.created_at,
      icon: "—",
    });
  } else if (!isCancelled(order.status)) {
    events.push({
      id: "payment-pending",
      title: "Payment pending",
      detail: "Awaiting wallet payment from customer.",
      at: order.created_at,
      icon: "…",
    });
  }

  const statusIndex = ORDER_FULFILLMENT_FLOW.indexOf(
    order.status as OrderStatus,
  );

  if (statusIndex >= 1) {
    events.push({
      id: "processing",
      title: "Order confirmed",
      detail: "Items are being packed for shipment.",
      at: order.created_at,
      icon: "✓",
    });
  }
  if (statusIndex >= 2) {
    events.push({
      id: "shipped",
      title: "Order shipped",
      detail: "Package handed off for delivery.",
      at: order.created_at,
      icon: "🚚",
    });
  }
  if (statusIndex >= 3) {
    events.push({
      id: "delivered",
      title: "Order delivered",
      detail: "Fulfillment completed.",
      at: order.created_at,
      icon: "★",
    });
  }

  if (isCancelled(order.status) && !isRefunded(order.payment_status)) {
    events.push({
      id: "cancelled",
      title: "Order cancelled",
      detail: "This order was cancelled.",
      at: order.created_at,
      icon: "×",
    });
  }

  if (order.linked_invoice) {
    const invRef = formatErpDocRef("INV", order.linked_invoice.id);
    const cancelled = order.linked_invoice.status === "cancelled";
    events.push({
      id: "invoiced",
      title: cancelled ? "Invoice cancelled" : "Converted to invoice",
      detail: cancelled
        ? `Previous invoice ${invRef} was cancelled.`
        : `Invoice ${invRef} created from this order.`,
      at: order.created_at,
      icon: "INV",
    });
  }

  return events;
}

function buildSalesOrderTimeline(order: OrderWithItems) {
  const ref = formatErpDocRef("SO", order.id);
  const events: {
    id: string;
    title: string;
    detail: string;
    at: string | null;
    icon: string;
  }[] = [
    {
      id: "created",
      title: "Sales order created",
      detail: `${ref} was created.`,
      at: order.created_at,
      icon: "SO",
    },
  ];

  if (order.merchant_note?.trim()) {
    events.push({
      id: "merchant-note",
      title: "Note added",
      detail: order.merchant_note.trim(),
      at: order.created_at,
      icon: "✎",
    });
  }

  if (order.linked_invoice) {
    const invRef = formatErpDocRef("INV", order.linked_invoice.id);
    const cancelled = order.linked_invoice.status === "cancelled";
    events.push({
      id: "invoiced",
      title: cancelled ? "Invoice cancelled" : "Converted to invoice",
      detail: cancelled
        ? `Previous invoice ${invRef} was cancelled.`
        : `Invoice ${invRef} created from this sales order.`,
      at: order.created_at,
      icon: "INV",
    });
  }

  if (isCancelled(order.status)) {
    events.push({
      id: "cancelled",
      title: "Sales order cancelled",
      detail: "This sales order was cancelled and stock was restored.",
      at: order.created_at,
      icon: "×",
    });
  }

  return events;
}

function formatOptionalDate(value: string | null | undefined) {
  if (!value) return null;
  return format(new Date(`${value}T12:00:00`), "EEE, d MMM yyyy");
}

function SalesOrderInfoSection({ order }: { order: OrderWithItems }) {
  const shipmentLabel = formatOptionalDate(order.shipment_date);

  return (
    <Card className="border border-border ring-0">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <Store className="size-4" />
          Fulfillment details
        </CardTitle>
        <CardDescription>Store, shipment, and reference for this sales order</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-4 text-sm">
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Store
          </p>
          <p className="mt-1 font-medium">{order.store_name ?? "Not assigned"}</p>
        </div>
        <div className="rounded-lg border bg-background p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Shipment date
          </p>
          <p className="mt-1 font-medium">{shipmentLabel ?? "Not set"}</p>
        </div>
        <div className="rounded-lg border bg-background p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Delivery method
          </p>
          <p className="mt-1 font-medium">{order.delivery_method ?? "Not set"}</p>
        </div>
        <div className="rounded-lg border bg-background p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Reference
          </p>
          <p className="mt-1 font-medium">{order.reference_number ?? "—"}</p>
        </div>
        {order.tax_inclusive != null ? (
          <div className="rounded-lg border bg-background p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Tax treatment
            </p>
            <p className="mt-1 font-medium">
              {order.tax_inclusive ? "Prices include tax" : "Prices exclude tax"}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function MerchantNoteSection({
  orderId,
  note,
  onSaved,
}: {
  orderId: string;
  note: string | null;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const trimmed = note?.trim() ?? "";

  function startEdit() {
    setDraft(note ?? "");
    setError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setDraft(note ?? "");
    setError(null);
    setEditing(false);
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        await updateOrderDetailsAction(orderId, {
          merchantNote: draft.trim() || null,
        });
        onSaved();
        setEditing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save note.");
      }
    });
  }

  return (
    <Card className="border border-border ring-0">
      <CardHeader className="flex flex-row items-start justify-between gap-2 border-b">
        <div>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="size-4" />
            Note for merchant
          </CardTitle>
        </div>
        {!editing ? (
          <Button type="button" variant="outline" size="sm" onClick={startEdit}>
            <Pencil data-icon="inline-start" />
            {trimmed ? "Edit" : "Add note"}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="pt-4">
        {editing ? (
          <div className="flex flex-col gap-3">
            <textarea
              className={textareaCls}
              rows={4}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Delivery instructions, preferences, etc."
              maxLength={500}
              disabled={isPending}
            />
            <p className="text-[11px] text-muted-foreground">
              {draft.length}/500 characters
            </p>
            {error ? (
              <p className="text-sm text-rose-600">{error}</p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={cancelEdit}  
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={isPending}
              >
                {isPending ? "Saving…" : "Save note"}
              </Button>
            </div>
          </div>
        ) : trimmed ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {trimmed}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            No note from the customer. Add delivery instructions or internal
            notes for your team.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ExpectedDeliverySection({
  orderId,
  preferredDate,
  expectedDate,
  onSaved,
}: {
  orderId: string;
  preferredDate: string | null | undefined;
  expectedDate: string | null | undefined;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(expectedDate ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const preferredLabel = preferredDate
    ? format(new Date(`${preferredDate}T12:00:00`), "EEE, d MMM yyyy")
    : null;
  const expectedLabel = expectedDate
    ? format(new Date(`${expectedDate}T12:00:00`), "EEE, d MMM yyyy")
    : null;

  function startEdit() {
    setDraft(expectedDate ?? "");
    setError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setDraft(expectedDate ?? "");
    setError(null);
    setEditing(false);
  }

  function handleSave() {
    setError(null);
    const trimmed = draft.trim();
    startTransition(async () => {
      try {
        await updateOrderDetailsAction(orderId, {
          shipmentDate: trimmed || null,
        });
        onSaved();
        setEditing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save delivery date.");
      }
    });
  }

  return (
    <Card className="border border-border ring-0">
      <CardHeader className="flex flex-row items-start justify-between gap-2 border-b">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Truck className="size-4" />
            Delivery dates
          </CardTitle>
          <CardDescription>
            Customer preference and your promised delivery date
          </CardDescription>
        </div>
        {!editing ? (
          <Button type="button" variant="outline" size="sm" onClick={startEdit}>
            <Pencil data-icon="inline-start" />
            {expectedLabel ? "Edit expected" : "Set expected"}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-4">
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Customer preferred
          </p>
          <p className="mt-1 font-medium">
            {preferredLabel ?? "No preference at checkout"}
          </p>
        </div>

        {editing ? (
          <div className="flex flex-col gap-3">
            <label className="text-sm font-medium" htmlFor="expected-delivery-date">
              Expected delivery
            </label>
            <input
              id="expected-delivery-date"
              type="date"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={isPending}
            />
            {error ? <p className="text-sm text-rose-600">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={cancelEdit} disabled={isPending}>
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={handleSave} disabled={isPending}>
                {isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border bg-background p-3 text-sm">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Expected delivery
            </p>
            <p className="mt-1 font-medium">
              {expectedLabel ?? "Not set — customer sees a pending message in the app"}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function OrderDetailPanel({ order }: { order: OrderWithItems }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [showEdit, setShowEdit] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { confirm } = useAdminAlert();

  const cancelled = isCancelled(order.status);
  const paid = isPaid(order.payment_status);
  const refunded = isRefunded(order.payment_status);
  const paymentNotRequired = isPaymentNotRequired(order.payment_status);
  const nextStatus = getNextFulfillmentStatus(order.status);
  const nextActionLabel = fulfillmentActionLabel(order.status);
  const needsStoreAssignment =
    order.fulfillment_status === "pending_assignment";
  const canAdvanceFulfillment =
    nextStatus && !(nextStatus === "shipped" && needsStoreAssignment);

  const paymentSummary = useMemo(
    () => computeOrderPaymentSummary(order),
    [order],
  );
  const total = paymentSummary.grandTotal;

  const addressText = order.addresses
    ? formatAddressLine(order.addresses)
    : null;

  const mapHref =
    order.addresses?.latitude != null && order.addresses?.longitude != null
      ? `https://www.google.com/maps?q=${order.addresses.latitude},${order.addresses.longitude}`
      : addressText
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressText)}`
        : null;

  const isSalesOrder = order.source === "sales_order";
  const isOnlineChannel =
    !isSalesOrder &&
    (order.source === "online" || order.source === "manual" || !order.source);
  const salesOrderRef = formatErpDocRef("SO", order.id);
  const activeInvoice =
    order.linked_invoice && order.linked_invoice.status !== "cancelled"
      ? order.linked_invoice
      : null;
  const cancelledInvoice =
    order.linked_invoice?.status === "cancelled" ? order.linked_invoice : null;
  const needsShipBeforeInvoice =
    isOnlineChannel && !order.inventory_committed;
  const canConvertToInvoice =
    (isSalesOrder || isOnlineChannel) &&
    !cancelled &&
    !activeInvoice &&
    !needsShipBeforeInvoice &&
    Boolean(order.users?.id) &&
    order.order_items.length > 0;
  const canCancelOrder = !cancelled && !activeInvoice;
  const canEditSalesOrder =
    isSalesOrder &&
    !cancelled &&
    !activeInvoice &&
    order.status !== "shipped" &&
    order.status !== "delivered";

  const timeline = useMemo(
    () => (isSalesOrder ? buildSalesOrderTimeline(order) : buildTimeline(order, total)),
    [isSalesOrder, order, total],
  );

  async function invalidate() {
    await queryClient.invalidateQueries({
      queryKey: adminQueryKeys.orderDetail(order.id),
    });
    await queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
  }

  function handleStatusChange(status: string) {
    setActionError(null);
    startTransition(async () => {
      try {
        await updateOrderStatusAction(order.id, status);
        await invalidate();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Update failed.");
      }
    });
  }

  async function handleCancelAndRefund() {
    const confirmMessage = paid
      ? `Cancel order #${shortOrderRef(order.id)} and refund ${formatInr(total)} to the customer wallet? Stock will be restored.`
      : `Cancel order #${shortOrderRef(order.id)}? Stock will be restored. No wallet refund applies to this order.`;

    const ok = await confirm({
      title: "Cancel order?",
      message: confirmMessage,
      confirmLabel: "Cancel order",
      destructive: true,
    });
    if (!ok) {
      return;
    }
    setActionError(null);
    startTransition(async () => {
      try {
        await cancelOrderAndRefundAction(order.id);
        await invalidate();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Cancel failed.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {showEdit ? (
        <OrderEditModal
          order={order}
          onClose={() => setShowEdit(false)}
          onSaved={() => void invalidate()}
        />
      ) : null}

      <AdminBreadcrumb
        items={
          isSalesOrder
            ? [
                { label: "Sales orders", href: "/admin/erp/sales-orders" },
                { label: salesOrderRef },
              ]
            : [
                { label: "Orders", href: "/admin/orders" },
                { label: `#${shortOrderRef(order.id)}` },
              ]
        }
        backHref={isSalesOrder ? "/admin/erp/sales-orders" : "/admin/orders"}
      />

      {actionError ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {actionError}
        </p>
      ) : null}

      {!isSalesOrder && isCustomerEditedOrder(order.customer_edited_at) ? (
        <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
          <p className="font-semibold">Customer edited this order</p>
          <p className="mt-1 text-violet-800/90">
            Fulfillment was reset to pending. Review new or changed line items (tagged below), then confirm the order again.
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1
            className={`font-semibold tracking-tight ${isSalesOrder ? "text-2xl" : "font-mono text-2xl"}`}
            title={isSalesOrder ? (order.sales_order_number ?? undefined) : undefined}
          >
            {isSalesOrder ? salesOrderRef : `#${shortOrderRef(order.id)}`}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <PaymentPill paymentStatus={order.payment_status} />
            <FulfillmentPill status={order.status} />
            {!isSalesOrder ? (
              <InventoryFulfillmentStatusPill status={order.fulfillment_status} />
            ) : null}
            {!isSalesOrder && isCustomerEditedOrder(order.customer_edited_at) ? (
              <CustomerEditedPill />
            ) : null}
            <span className="text-sm text-muted-foreground">
              {order.created_at
                ? format(new Date(order.created_at), "MMM d, yyyy · h:mm a")
                : ""}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {needsShipBeforeInvoice && !activeInvoice && !cancelled ? (
            <span className="text-xs text-muted-foreground">
              Ship order before invoicing
            </span>
          ) : null}
          {canConvertToInvoice ? (
            <Button
              size="sm"
              disabled={isPending}
              onClick={() => {
                setActionError(null);
                startTransition(async () => {
                  try {
                    const convertPath = isSalesOrder
                      ? `erp/sales-orders/${order.id}/convert-to-invoice`
                      : `orders/${order.id}/convert-to-invoice`;

                    if (
                      typeof navigator !== "undefined" &&
                      navigator.onLine
                    ) {
                      const res = await adminPost<{ invoiceId: string }>(
                        convertPath,
                        {},
                      );
                      router.push(`/admin/erp/invoices/${res.invoiceId}`);
                      await invalidate();
                      return;
                    }

                    if (!isSalesOrder) {
                      setActionError(
                        "You are offline. Reconnect to convert this order to an invoice.",
                      );
                      return;
                    }

                    if (!order.store_id) {
                      setActionError("Sales order has no store.");
                      return;
                    }
                    const supabase = createSupabaseBrowserClient();
                    const staffUserId = await resolveOutboxUserId(supabase);
                    if (!staffUserId) {
                      setActionError("You must be signed in.");
                      return;
                    }
                    const outbox = createOutboxStore();
                    try {
                      await outbox.enqueue({
                        operationType:
                          ERP_CLIENT_OPERATION_TYPES.salesOrder.convertToInvoice,
                        schemaVersion: 1,
                        payload: { orderId: order.id },
                        userId: staffUserId,
                        storeId: order.store_id,
                        terminalId: getOrCreateErpTerminalId(),
                        resourceScope: salesOrderResourceScope(order.id),
                      });
                    } catch (enqueueErr) {
                      setActionError(
                        enqueueErr instanceof OutboxEnqueueError
                          ? enqueueErr.message
                          : enqueueErr instanceof Error
                            ? enqueueErr.message
                            : "Could not queue conversion",
                      );
                      return;
                    } finally {
                      await outbox.close();
                    }
                    dispatchOutboxChanged();
                    broadcastSyncWake();
                    await invalidate();
                    setActionError(
                      "Conversion queued — open this order again after sync to view the invoice.",
                    );
                  } catch (err) {
                    setActionError(
                      err instanceof Error ? err.message : "Conversion failed",
                    );
                  }
                });
              }}
            >
              {cancelledInvoice ? "Re-issue invoice" : "Convert to invoice"}
            </Button>
          ) : null}
          {(activeInvoice ?? cancelledInvoice) ? (
            <Link
              href={`/admin/erp/invoices/${(activeInvoice ?? cancelledInvoice)!.id}`}
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              {cancelledInvoice ? "View cancelled invoice" : "View invoice"}
            </Link>
          ) : null}
          {canEditSalesOrder ? (
            <Link
              href={`/admin/erp/sales-orders/${order.id}/edit`}
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              <Pencil data-icon="inline-start" />
              Edit
            </Link>
          ) : null}
          {canCancelOrder && isSalesOrder ? (
            <SalesOrderCancelButton
              order={order}
              disabled={isPending}
              onQueued={() => void invalidate()}
              onError={(message) => setActionError(message)}
            />
          ) : null}
          {canCancelOrder && !isSalesOrder ? (
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={handleCancelAndRefund}
            >
              <RotateCcw data-icon="inline-start" />
              {paid ? "Cancel & refund" : "Cancel order"}
            </Button>
          ) : null}
          {!isSalesOrder ? (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={isPending || cancelled}
                onClick={() => setShowEdit(true)}
              >
                <Pencil data-icon="inline-start" />
                Edit
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="outline" size="sm" disabled={isPending} />
                  }
                >
                  More actions
                  <ChevronDown data-icon="inline-end" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuGroup>
                    <DropdownMenuItem
                      nativeButton={false}
                      render={
                        <Link
                          href={`/admin/orders/${order.id}/invoice`}
                          target="_blank"
                        />
                      }
                    >
                      <Printer />
                      Print invoice
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      nativeButton={false}
                      render={
                        <Link
                          href={`/admin/orders/${order.id}/invoice?download=1`}
                          target="_blank"
                        />
                      }
                    >
                      <Download />
                      Download invoice (PDF)
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              {canAdvanceFulfillment && nextActionLabel ? (
                <Button
                  size="sm"
                  disabled={isPending}
                  onClick={() => handleStatusChange(nextStatus!)}
                >
                  {nextActionLabel}
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {!isSalesOrder ? (
            <OrderFulfillmentPanel order={order} onUpdated={invalidate} />
          ) : null}

          <Card className="border border-border ring-0">
            <CardHeader className="border-b">
              <CardTitle>Line items</CardTitle>
              <CardDescription>
                {cancelled
                  ? isSalesOrder
                    ? "This sales order was cancelled."
                    : "This order was cancelled."
                  : isSalesOrder
                    ? `Sales order status: ${order.status}`
                    : `Order status: ${order.status}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 pt-4">
              <OrderLineItemsList order={order} />
              {!isSalesOrder && !cancelled && canAdvanceFulfillment && nextStatus ? (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                  <p className="text-sm text-muted-foreground">
                    <Truck className="mr-1 inline" />
                    Next step: {nextActionLabel?.toLowerCase()}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => handleStatusChange(nextStatus)}
                  >
                    {nextActionLabel}
                  </Button>
                </div>
              ) : !isSalesOrder && needsStoreAssignment ? (
                <p className="border-t pt-3 text-sm text-amber-800">
                  Assign a fulfilling store above before marking this order as
                  shipped.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border border-border ring-0">
            <CardHeader className="border-b">
              <CardTitle>Payment summary</CardTitle>
              {isSalesOrder ? (
                <CardDescription>Totals captured when this sales order was created</CardDescription>
              ) : null}
            </CardHeader>
            <CardContent className="flex flex-col gap-2 pt-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{currencyLabel("Subtotal")}</span>
                <span className="tabular-nums">
                  {formatInr(paymentSummary.catalogSubtotal ?? paymentSummary.itemTotal)}
                </span>
              </div>
              {paymentSummary.totalDiscount > 0 ? (
                <>
                  {paymentSummary.lineDiscount > 0 ? (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Line discounts</span>
                      <span className="tabular-nums text-emerald-700">
                        −{formatInr(paymentSummary.lineDiscount)}
                      </span>
                    </div>
                  ) : null}
                  {paymentSummary.orderDiscount > 0 ? (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Extra order discount</span>
                      <span className="tabular-nums text-emerald-700">
                        −{formatInr(paymentSummary.orderDiscount)}
                      </span>
                    </div>
                  ) : null}
                  {paymentSummary.lineDiscount <= 0 && paymentSummary.orderDiscount <= 0 ? (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Total discount</span>
                      <span className="tabular-nums text-emerald-700">
                        −{formatInr(paymentSummary.totalDiscount)}
                      </span>
                    </div>
                  ) : null}
                </>
              ) : null}
              {paymentSummary.tax > 0 ? (
                <div className="flex justify-between text-muted-foreground">
                  <span>Tax</span>
                  <span className="tabular-nums">{formatInr(paymentSummary.tax)}</span>
                </div>
              ) : null}
              <Separator />
              <div className="flex justify-between font-semibold">
                <span>{currencyLabel(isSalesOrder ? "Total" : "Order total")}</span>
                <span className="tabular-nums">{formatInr(total)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Payment status</span>
                <span>
                  {paymentNotRequired
                    ? "No payment required"
                    : (order.payment_status ?? "pending")}
                </span>
              </div>
              {refunded ? (
                <div className="flex justify-between font-medium text-rose-700">
                  <span>{currencyLabel("Refunded to wallet")}</span>
                  <span className="tabular-nums">−{formatInr(total)}</span>
                </div>
              ) : paid ? (
                <div className="flex justify-between font-medium text-emerald-700">
                  <span>{currencyLabel(isSalesOrder ? "Paid" : "Paid via wallet")}</span>
                  <span className="tabular-nums">{formatInr(total)}</span>
                </div>
              ) : paymentNotRequired ? (
                <div className="flex justify-between text-muted-foreground">
                  <span>Payment method</span>
                  <span>Not captured</span>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border border-border ring-0">
            <CardHeader className="border-b">
              <CardTitle>Timeline</CardTitle>
              <CardDescription>
                {isSalesOrder ? "Sales order milestones" : "Order milestones"}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <ol className="flex flex-col gap-4">
                {timeline.map((event) => (
                  <li key={event.id} className="flex gap-3">
                    <TimelineAvatar label={event.icon} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{event.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {event.detail}
                      </p>
                      {event.at ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {format(new Date(event.at), "MMM d, yyyy · h:mm a")}
                          {" · "}
                          {formatDistanceToNow(new Date(event.at), {
                            addSuffix: true,
                          })}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <MerchantNoteSection
            orderId={order.id}
            note={order.merchant_note}
            onSaved={() => void invalidate()}
          />

          {!isSalesOrder ? (
            <ExpectedDeliverySection
              orderId={order.id}
              preferredDate={order.preferred_delivery_date}
              expectedDate={order.shipment_date}
              onSaved={() => void invalidate()}
            />
          ) : (
            <SalesOrderInfoSection order={order} />
          )}

          <Card className="border border-border ring-0">
            <CardHeader className="border-b pb-4">
              <CardTitle>Customer</CardTitle>
              <CardDescription>
                {isSalesOrder
                  ? "Contact details for this sales order"
                  : "Contact details and delivery information"}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5 pt-5">
              <div className="flex items-start gap-3">
                <CustomerAvatar
                  name={order.users?.name}
                  avatarUrl={order.users?.avatar_url}
                  size="lg"
                  className="shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold leading-tight">
                    {order.users?.name ?? "Guest"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {order.customer_order_count} order
                    {order.customer_order_count === 1 ? "" : "s"} with DHOOM Trading
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2.5 rounded-lg border bg-muted/30 p-3.5 text-sm">
                {order.users?.email ? (
                  <div className="flex items-start gap-2.5">
                    <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Email
                      </p>
                      <a
                        href={`mailto:${order.users.email}`}
                        className="break-all font-medium hover:underline"
                      >
                        {order.users.email}
                      </a>
                    </div>
                  </div>
                ) : null}
                {order.users?.phone ? (
                  <div className="flex items-start gap-2.5">
                    <Phone className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Phone
                      </p>
                      <a
                        href={`tel:${order.users.phone}`}
                        className="font-medium hover:underline"
                      >
                        {order.users.phone}
                      </a>
                    </div>
                  </div>
                ) : null}
                {!order.users?.email && !order.users?.phone ? (
                  <p className="text-muted-foreground">
                    No contact details on file.
                  </p>
                ) : null}
              </div>

              {!isSalesOrder ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="size-4 text-muted-foreground" />
                    <p className="text-sm font-medium">Delivery store</p>
                  </div>
                  {addressText ? (
                    <div className="rounded-lg border bg-background p-3.5">
                      {order.addresses?.label ? (
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {order.addresses.label}
                        </p>
                      ) : null}
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {addressText}
                      </p>
                      {order.addresses?.phone ? (
                        <p className="mt-2 text-sm text-muted-foreground">
                          Phone: {order.addresses.phone}
                        </p>
                      ) : null}
                      {order.addresses?.latitude != null &&
                      order.addresses?.longitude != null ? (
                        <div className="mt-3 space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">
                            Pin {Number(order.addresses.latitude).toFixed(6)},{' '}
                            {Number(order.addresses.longitude).toFixed(6)}
                          </p>
                          <AddressMapEmbed
                            latitude={Number(order.addresses.latitude)}
                            longitude={Number(order.addresses.longitude)}
                            label={order.addresses.label ?? "Delivery"}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="rounded-lg border border-dashed bg-muted/20 p-3.5 text-sm text-muted-foreground">
                      No delivery store saved for this order.
                    </p>
                  )}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2 border-t pt-4">
                {order.users?.id ? (
                  <Link
                    href={`/admin/customers/${order.users.id}`}
                    className={buttonVariants({
                      size: "sm",
                      variant: "default",
                      className: "gap-1.5",
                    })}
                  >
                    <User data-icon="inline-start" />
                    View customer
                  </Link>
                ) : null}
                {!isSalesOrder && mapHref ? (
                  <a
                    href={mapHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonVariants({
                      size: "sm",
                      variant: "outline",
                      className: "gap-1.5",
                    })}
                  >
                    <MapPin data-icon="inline-start" />
                    Open in maps
                    <ExternalLink className="size-3.5 opacity-70" />
                  </a>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
