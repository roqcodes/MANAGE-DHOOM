"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";

import { formatAuditLogUserDetail } from "@/modules/erp/lib/audit-log-display";
import type { AuditLogEntry } from "@/common/erp/types";
import type { ErpPurchaseOrderDetail } from "@/common/erp/purchasing-types";
import { ERP_CLIENT_OPERATION_TYPES } from "@/lib/erp/client-operations/operation-types";
import { dispatchOutboxChanged, OUTBOX_CHANGED_EVENT } from "@/lib/sync/outbox-browser-events";
import { useOutboxQueueActivity } from "@/lib/sync/hooks/use-outbox-queue-activity";
import { pendingPurchaseOrderOutboxActivity } from "@/lib/sync/purchase-order-outbox-pending";
import { OutboxEnqueueError } from "@/lib/sync/outbox-errors";
import { createOutboxStore } from "@/lib/sync/outbox-store";
import { getOrCreateErpTerminalId } from "@/lib/sync/erp-terminal-id";
import { broadcastSyncWake } from "@/lib/sync/sync-network";
import { resolveOutboxUserId } from "@/lib/sync/resolve-outbox-user-id.client";
import { createSupabaseBrowserClient } from "@/lib/integrations/supabase/client";
import {
  purchaseOrderResourceScope,
  type PurchaseOrderDeliverFinalizePayload,
} from "@/modules/erp/types/purchase-payload";
import { AdminDetailSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { adminGet, adminPatch } from "@/modules/admin/lib/admin-api-client";
import { PurchaseBillFormView } from "@/modules/admin/views/purchasing/purchase-bill-form-view";
import { cancelAdminPurchaseOrderAction } from "@/modules/purchase-orders/actions/admin-purchase-orders.actions";
import { AdminBreadcrumb } from "@/modules/admin/components/admin-breadcrumb";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatCurrencyAmount } from "@/lib/format-currency";
import {
  landedAllocFromStoredLine,
  loadedUnitCostFromStoredLine,
} from "@/modules/purchasing/lib/purchase-landed-allocation";
import { formatErpDocRef } from "@/lib/erp-document-ref";
import { PoStatusPill } from "@/modules/purchase-orders/components/purchase-orders-ui";
import { cn } from "@/lib/utils";
import { useAdminAlert } from "@/modules/admin/components/admin-alert-provider";
import { ErrorsFeedbackBridge } from "@/modules/feedback/components/errors-feedback-bridge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

// ─── Types ────────────────────────────────────────────────────────────────────

type TransitMode = "by_sea" | "by_air" | "in_customs";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lineProductName(
  line: ErpPurchaseOrderDetail["purchase_order_items"][number],
): string {
  const base =
    (line as { products?: { name?: string | null } | null }).products?.name ??
    line.product_variants?.products?.name ??
    "Item";
  const variant = line.product_variants?.name;
  return variant ? `${base} — ${variant}` : base;
}

const TRANSIT_MODE_LABELS: Record<TransitMode, string> = {
  by_sea: "By Sea 🚢",
  by_air: "By Air ✈️",
  in_customs: "In Customs 🛃",
};

function transitModeBadgeClass(mode: TransitMode): string {
  return mode === "by_sea"
    ? "border-sky-200 bg-sky-50 text-sky-700"
    : mode === "by_air"
      ? "border-violet-200 bg-violet-50 text-violet-700"
      : "border-amber-200 bg-amber-50 text-amber-800";
}

// ─── Timeline builder ────────────────────────────────────────────────────────

function buildTimeline(po: ErpPurchaseOrderDetail) {
  const events: Array<{
    id: string;
    title: string;
    detail: string;
    tone: "done" | "current" | "pending" | "warn";
  }> = [
    {
      id: "created",
      title: "PO Created",
      detail: "Purchase order raised — no accounting or inventory impact.",
      tone: "done",
    },
  ];

  const status = po.status ?? "pending";

  if (status === "cancelled") {
    events.push({
      id: "cancelled",
      title: "Cancelled",
      detail: "Purchase order cancelled before completion.",
      tone: "warn",
    });
    return events;
  }

  if (status === "production" || status === "pending") {
    events.push({
      id: "production",
      title: "In Production",
      detail: "Order in production with supplier — ready for pickup when dispatch is scheduled.",
      tone: "current",
    });
  }

  const inTransit =
    status === "by_sea" || status === "by_air" || status === "in_customs";

  if (inTransit || status === "received" || status === "fully_received") {
    const modeLabel =
      status === "by_sea"
        ? "By Sea"
        : status === "by_air"
          ? "By Air"
          : status === "in_customs"
            ? "In Customs"
            : (po as unknown as { transit_mode?: string }).transit_mode
              ? (po as unknown as { transit_mode: string }).transit_mode.replace(/_/g, " ")
              : "In transit";

    events.push({
      id: "pickup",
      title: "Ready For Pickup",
      detail: `Dispatched — ${modeLabel}${po.expected_delivery_date ? ` · Expected ${po.expected_delivery_date}` : ""}.`,
      tone: inTransit ? "current" : "done",
    });
  }

  if (status === "received" || status === "fully_received") {
    events.push({
      id: "received",
      title: "Received",
      detail: "Goods received in warehouse. Ready to generate invoice.",
      tone: status === "received" ? "current" : "done",
    });
  }

  if (po.linked_bill) {
    events.push({
      id: "invoice",
      title:
        po.linked_bill.status === "draft"
          ? "Draft Invoice"
          : "Invoice Finalized",
      detail:
        po.linked_bill.status === "draft"
          ? "Draft saved — inventory & accounting pending finalization."
          : `Posted to accounting for ${formatCurrencyAmount(po.linked_bill.total_amount)}.`,
      tone: po.linked_bill.status === "draft" ? "current" : "done",
    });
  }

  if (po.delivery.deliverySubmitted) {
    events.push({
      id: "finalized",
      title: "Delivery & Invoice Finalized",
      detail: "Stock and accounting posted.",
      tone: "done",
    });
  }

  return events;
}

// ─── Ready For Pickup Modal ───────────────────────────────────────────────────

function ReadyForPickupModal({
  open,
  initialDate,
  onClose,
  onSave,
}: {
  open: boolean;
  initialDate?: string | null;
  onClose: () => void;
  onSave: (mode: TransitMode, date: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<TransitMode | null>(null);
  const [date, setDate] = useState(
    initialDate || new Date().toISOString().slice(0, 10),
  );

  useEffect(() => {
    if (open) {
      setMode(null);
      setDate(initialDate || new Date().toISOString().slice(0, 10));
      setErr(null);
    }
  }, [open, initialDate]);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSave() {
    if (!mode) {
      setErr("Please select a transit mode.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await onSave(mode, date);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  const modes: { id: TransitMode; label: string; icon: string; desc: string }[] = [
    { id: "by_sea", label: "By Sea", icon: "🚢", desc: "Ocean freight" },
    { id: "by_air", label: "By Air", icon: "✈️", desc: "Air freight" },
    { id: "in_customs", label: "In Customs", icon: "🛃", desc: "Customs clearance" },
  ];

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md" instant>
        <DialogHeader>
          <DialogTitle>Ready For Pickup</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Select how the shipment is travelling and when it is expected.
          </p>

          {/* Mode selector */}
          <div className="grid grid-cols-3 gap-2">
            {modes.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg border-2 p-3 text-center transition-colors",
                  mode === m.id
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border hover:border-border/70 hover:bg-muted/50",
                )}
              >
                <span className="text-2xl">{m.icon}</span>
                <span className="text-xs font-semibold">{m.label}</span>
                <span className="text-[10px] text-muted-foreground">{m.desc}</span>
              </button>
            ))}
          </div>

          {/* Expected date */}
          <label className="block text-sm">
            <span className="mb-1 block text-slate-500">Expected Delivery Date</span>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="max-w-xs"
            />
          </label>

          {err ? <p className="text-sm text-destructive">{err}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !mode}>
            {saving ? "Saving…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function PurchaseOrderDetailErpView({ poId }: { poId: string }) {
  const { confirm } = useAdminAlert();
  const [pending, startTransition] = useTransition();
  const { operations: outboxOperations } = useOutboxQueueActivity();
  const outboxPending = useMemo(
    () => pendingPurchaseOrderOutboxActivity(outboxOperations, poId),
    [outboxOperations, poId],
  );
  const [po, setPo] = useState<ErpPurchaseOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showPickupModal, setShowPickupModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);

  function reload() {
    return adminGet<{ po: ErpPurchaseOrderDetail; auditLogs: AuditLogEntry[] }>(
      `erp/purchase-orders/${poId}`,
    ).then((res) => {
      setPo(res.po);
      setAuditLogs(res.auditLogs ?? []);
    });
  }

  useEffect(() => {
    setLoading(true);
    reload()
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poId]);

  useEffect(() => {
    const onOutboxChange = () => {
      void reload().catch(() => undefined);
    };
    window.addEventListener(OUTBOX_CHANGED_EVENT, onOutboxChange);
    return () => window.removeEventListener(OUTBOX_CHANGED_EVENT, onOutboxChange);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poId]);

  const timeline = po ? buildTimeline(po) : [];

  if (loading && !po) return <AdminDetailSkeleton />;
  if (!po) {
    return (
      <p className="p-4 text-sm text-destructive">
        {error ?? "Purchase order not found."}
      </p>
    );
  }

  const status = po.status ?? "pending";
  const inTransit = status === "by_sea" || status === "by_air" || status === "in_customs";
  const activeBill =
    po.linked_bill && po.linked_bill.status !== "cancelled" ? po.linked_bill : null;

  // Derived flags
  const canEdit = status === "pending" || status === "production";
  const canCancel = status === "pending" || status === "production";
  const showReadyForPickup = status === "production" || status === "pending";
  const showMarkReceived = inTransit;
  const showGenerateInvoice = status === "received" && !po.delivery.deliverySubmitted;
  const showInvoiceLink = !!activeBill;
  const draftBillId =
    activeBill?.status === "draft" ? activeBill.id : undefined;
  const invoiceModalMode = draftBillId ? "edit" : "create";
  const showFinalizePoInvoice = showGenerateInvoice && Boolean(draftBillId);

  // ── Action handlers ────────────────────────────────────────────────────────

  async function handleCancel() {
    const ok = await confirm({
      title: "Cancel purchase order?",
      message: "Cancel this purchase order?",
      confirmLabel: "Cancel order",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await cancelAdminPurchaseOrderAction(poId);
      if (!res.ok) {
        setError(res.message ?? "Cancel failed");
        return;
      }
      await reload();
    });
  }

  async function handleReadyForPickupSave(mode: TransitMode, date: string) {
    await adminPatch<{ ok: boolean }>(
      `erp/purchase-orders/${poId}/status`,
      { status: mode, expectedDate: date },
    );
    await reload();
  }

  async function handleMarkReceived() {
    const ok = await confirm({
      title: "Mark as Received?",
      message:
        "Confirm goods have been received in the warehouse. You will then be able to generate the invoice.",
      confirmLabel: "Mark received",
    });
    if (!ok) return;
    startTransition(async () => {
      try {
        setError(null);
        await adminPatch<{ ok: boolean }>(
          `erp/purchase-orders/${poId}/status`,
          { status: "received" },
        );
        await reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to mark received.");
      }
    });
  }

  async function handleFinalizePoInvoice() {
    if (outboxPending.draftBillPending) {
      setError("Draft invoice is still syncing. Wait for sync to complete.");
      return;
    }
    if (outboxPending.deliveryPending) {
      setError("Invoice finalization is already queued or syncing.");
      return;
    }

    const ok = await confirm({
      title: "Finalize invoice?",
      message:
        "Post inventory and accounting from the saved draft invoice. Save invoice changes in the editor first if needed.",
      confirmLabel: "Finalize invoice",
    });
    if (!ok) return;

    const currentPo = po;
    if (!currentPo) return;

    startTransition(async () => {
      try {
        setError(null);
        const storeId = currentPo.store_id;
        if (!storeId) {
          setError("Purchase order has no store.");
          return;
        }
        if (!draftBillId) {
          setError("Save an invoice draft before finalizing.");
          return;
        }

        const billRes = await adminGet<{
          bill: {
            purchase_date: string;
            erp_purchase_bill_lines: Array<{
              variant_id: string | null;
              product_id?: string | null;
              quantity: number;
            }>;
          };
        }>(`erp/purchase-bills/${draftBillId}`);

        const billLines = billRes.bill.erp_purchase_bill_lines;
        const deliverLines = currentPo.purchase_order_items
          .map((poLine) => {
            const poProductId =
              (poLine as { product_id?: string | null }).product_id ??
              poLine.product_variants?.product_id ??
              null;
            const billLine = billLines.find(
              (bl) =>
                (poLine.variant_id != null && bl.variant_id === poLine.variant_id) ||
                (poProductId != null &&
                  (bl as { product_id?: string | null }).product_id === poProductId),
            );
            const deliveredQty = billLine ? Number(billLine.quantity) : 0;
            return { poLineId: poLine.id as string, deliveredQty };
          })
          .filter((line) => line.deliveredQty > 0);

        if (deliverLines.length === 0) {
          setError("Invoice has no billable quantities to finalize.");
          return;
        }

        const supabase = createSupabaseBrowserClient();
        const staffUserId = await resolveOutboxUserId(supabase);
        if (!staffUserId) {
          setError("You must be signed in to finalize the invoice.");
          return;
        }

        const deliverPayload: PurchaseOrderDeliverFinalizePayload = {
          poId,
          receiveDate: billRes.bill.purchase_date,
          lines: deliverLines,
        };

        const store = createOutboxStore();
        try {
          await store.enqueue({
            operationType: ERP_CLIENT_OPERATION_TYPES.purchaseOrder.deliverFinalize,
            schemaVersion: 1,
            payload: deliverPayload,
            userId: staffUserId,
            storeId,
            terminalId: getOrCreateErpTerminalId(),
            resourceScope: purchaseOrderResourceScope(poId),
          });
        } catch (enqueueErr) {
          if (enqueueErr instanceof OutboxEnqueueError) {
            setError(enqueueErr.message);
          } else {
            setError(
              enqueueErr instanceof Error
                ? enqueueErr.message
                : "Could not queue delivery locally.",
            );
          }
          return;
        } finally {
          await store.close();
        }

        dispatchOutboxChanged();
        broadcastSyncWake();
        await reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Finalize failed.");
      }
    });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <AdminBreadcrumb
        items={[
          { label: "Purchase orders", href: "/admin/purchase-orders" },
          { label: formatErpDocRef("PO", poId) },
        ]}
        backHref="/admin/purchase-orders"
      />

      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold" title={po.po_number ?? undefined}>
            {formatErpDocRef("PO", poId)}
          </h1>
          <div className="flex items-center gap-2">
            <PoStatusPill status={po.status ?? "pending"} />
            {inTransit ? (
              <span
                className={cn(
                  "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
                  transitModeBadgeClass(status as TransitMode),
                )}
              >
                {TRANSIT_MODE_LABELS[status as TransitMode]}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {canEdit ? (
            <Link
              href={`/admin/purchase-orders?form=edit&id=${poId}`}
              className={buttonVariants({ variant: "outline" })}
            >
              Edit
            </Link>
          ) : null}

          {/* Ready For Pickup */}
          {showReadyForPickup ? (
            <Button onClick={() => setShowPickupModal(true)}>
              Ready For Pickup
            </Button>
          ) : null}

          {/* Mark as Received */}
          {showMarkReceived ? (
            <Button disabled={pending} onClick={handleMarkReceived}>
              {pending ? "Updating…" : "Mark as Received"}
            </Button>
          ) : null}

          {showGenerateInvoice ? (
            <Button
              disabled={pending || outboxPending.deliveryPending}
              onClick={() => setShowInvoiceModal(true)}
            >
              {draftBillId ? "Edit invoice" : "Generate invoice"}
            </Button>
          ) : null}

          {showFinalizePoInvoice ? (
            <Button
              disabled={
                pending ||
                outboxPending.deliveryPending ||
                outboxPending.draftBillPending
              }
              onClick={() => void handleFinalizePoInvoice()}
            >
              {pending ? "Finalizing…" : "Finalize invoice"}
            </Button>
          ) : null}

          {/* Invoice link (when already has a bill) */}
          {showInvoiceLink ? (
            <Link
              href={`/admin/erp/purchase-bills/${activeBill.id}`}
              className={buttonVariants({ variant: "outline" })}
            >
              Invoice {formatErpDocRef("PB", activeBill.id)}
            </Link>
          ) : null}

          {/* Receive record */}
          {po.delivery.receiveId ? (
            <Link
              href={`/admin/erp/purchase-receives/${po.delivery.receiveId}`}
              className={buttonVariants({ variant: "outline" })}
            >
              Receive record
            </Link>
          ) : null}

          {canCancel ? (
            <Button variant="destructive" disabled={pending} onClick={handleCancel}>
              Cancel PO
            </Button>
          ) : null}
        </div>
      </div>

      <ErrorsFeedbackBridge errors={error} />

      {/* Outbox sync banner */}
      {outboxPending.draftBillPending ||
      outboxPending.deliveryPending ||
      outboxPending.poUpdatePending ? (
        <Card className="border-sky-200 bg-sky-50">
          <CardContent className="py-3 text-sm text-sky-900">
            {outboxPending.draftBillPending
              ? "Draft purchase invoice is syncing to the server. This page will update when it completes."
              : outboxPending.deliveryPending
                ? "Invoice finalization is syncing. Stock and accounting will post when sync completes."
                : "Purchase order changes are syncing."}
          </CardContent>
        </Card>
      ) : null}

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {timeline.map((event, idx) => (
            <div key={event.id} className="flex gap-3">
              <div
                className={cn(
                  "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  event.tone === "done" && "bg-emerald-100 text-emerald-800",
                  event.tone === "current" && "bg-sky-100 text-sky-800",
                  event.tone === "pending" && "bg-slate-100 text-slate-600",
                  event.tone === "warn" && "bg-rose-100 text-rose-800",
                )}
              >
                {idx + 1}
              </div>
              <div>
                <p className="text-sm font-medium">{event.title}</p>
                <p className="text-sm text-slate-600">{event.detail}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {showInvoiceModal ? (
        <PurchaseBillFormView
          key={`${poId}-${draftBillId ?? "new"}`}
          variant="modal"
          mode={invoiceModalMode}
          billId={draftBillId}
          poIdFromQuery={poId}
          formTitle={invoiceModalMode === "edit" ? "Edit invoice" : "Generate invoice"}
          formDescription="Record vendor invoice lines, landed costs, and totals for this purchase order."
          open={showInvoiceModal}
          onOpenChange={setShowInvoiceModal}
          onSuccess={() => void reload()}
        />
      ) : null}

      {/* Vendor & delivery details */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vendor &amp; delivery</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="text-slate-500">Vendor:</span> {po.vendors?.name ?? "—"}</p>
            <p><span className="text-slate-500">Store:</span> {po.stores?.name ?? "—"}</p>
            <p><span className="text-slate-500">PO date:</span> {po.po_date ?? "—"}</p>
            <p>
              <span className="text-slate-500">Expected delivery:</span>{" "}
              {po.expected_delivery_date ?? "—"}
            </p>
            <p><span className="text-slate-500">Reference:</span> {po.reference ?? "—"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Totals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Subtotal: {formatCurrencyAmount(po.subtotal)}</p>
            <p>Tax: {formatCurrencyAmount(po.tax_total)}</p>
            <p>Discount: {formatCurrencyAmount(po.discount)}</p>
            {(po.landed_cost_total ?? 0) > 0 ? (
              <p>Landed costs: {formatCurrencyAmount(po.landed_cost_total ?? 0)}</p>
            ) : null}
            <p className="font-semibold">PO total: {formatCurrencyAmount(po.total_amount ?? 0)}</p>
            {activeBill ? (
              <p className="pt-2 text-slate-600">
                Invoice ({activeBill.status}): {formatCurrencyAmount(activeBill.total_amount)}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Line items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Line items</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-500">
                <th className="pb-2">Product</th>
                <th className="pb-2">Ordered</th>
                <th className="pb-2">Delivered</th>
                <th className="pb-2">Rate</th>
                {(po.landed_cost_total ?? 0) > 0 ? (
                  <th className="pb-2">Loaded unit</th>
                ) : null}
                {(po.landed_cost_total ?? 0) > 0 ? (
                  <th className="pb-2 text-right">Landed</th>
                ) : null}
                <th className="pb-2">Line total</th>
              </tr>
            </thead>
            <tbody>
              {po.purchase_order_items.map((line) => {
                const landedAlloc = landedAllocFromStoredLine(line);
                const loadedUnit = loadedUnitCostFromStoredLine({
                  quantity: line.quantity,
                  purchasePrice: line.price,
                  landed_cost_allocated: line.landed_cost_allocated,
                  unit_loaded_cost: line.unit_loaded_cost,
                });
                return (
                  <tr key={line.id} className="border-t border-slate-100">
                    <td className="py-2">{lineProductName(line)}</td>
                    <td className="py-2 tabular-nums">{line.quantity}</td>
                    <td className="py-2 tabular-nums">{line.accepted_qty ?? 0}</td>
                    <td className="py-2">{formatCurrencyAmount(line.price)}</td>
                    {(po.landed_cost_total ?? 0) > 0 ? (
                      <td className="py-2 tabular-nums text-slate-600">
                        {formatCurrencyAmount(loadedUnit)}
                      </td>
                    ) : null}
                    {(po.landed_cost_total ?? 0) > 0 ? (
                      <td className="py-2 text-right tabular-nums">
                        {landedAlloc > 0 ? formatCurrencyAmount(landedAlloc) : "—"}
                      </td>
                    ) : null}
                    <td className="py-2">{formatCurrencyAmount(line.line_total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Audit log */}
      {auditLogs.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {auditLogs.map((log) => (
              <p key={log.id}>
                <span className="text-slate-500">{new Date(log.created_at).toLocaleString()}</span>
                {" — "}
                <span className="font-medium">{log.action.replace(/_/g, " ")}</span>
                {" by "}
                {formatAuditLogUserDetail(log)}
                {log.description ? `: ${log.description}` : ""}
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* Ready For Pickup Modal */}
      <ReadyForPickupModal
        open={showPickupModal}
        initialDate={po.expected_delivery_date}
        onClose={() => setShowPickupModal(false)}
        onSave={handleReadyForPickupSave}
      />
    </div>
  );
}
