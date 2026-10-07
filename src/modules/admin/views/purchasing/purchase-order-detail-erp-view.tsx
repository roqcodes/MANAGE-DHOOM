"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";

import { formatAuditLogUserDetail } from "@/modules/erp/lib/audit-log-display";
import type { AuditLogEntry } from "@/common/erp/types";
import type { ErpPurchaseOrderDetail } from "@/common/erp/purchasing-types";
import { matchPoLineToBillLine } from "@/common/erp/match-po-bill-line";
import { createSupabaseBrowserClient } from "@/lib/integrations/supabase/client";
import { ERP_CLIENT_OPERATION_TYPES } from "@/lib/erp/client-operations/operation-types";
import { dispatchOutboxChanged } from "@/lib/sync/outbox-browser-events";
import { OutboxEnqueueError } from "@/lib/sync/outbox-errors";
import { createOutboxStore } from "@/lib/sync/outbox-store";
import { getOrCreateErpTerminalId } from "@/lib/sync/erp-terminal-id";
import { broadcastSyncWake } from "@/lib/sync/sync-network";
import { resolveOutboxUserId } from "@/lib/sync/resolve-outbox-user-id.client";
import {
  purchaseOrderResourceScope,
  type PurchaseOrderDeliverFinalizePayload,
} from "@/modules/erp/types/purchase-payload";
import { AdminDetailSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { cancelAdminPurchaseOrderAction } from "@/modules/purchase-orders/actions/admin-purchase-orders.actions";
import { AdminBreadcrumb } from "@/modules/admin/components/admin-breadcrumb";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import { coalesceNumber } from "@/lib/numeric-input";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { formatErpDocRef } from "@/lib/erp-document-ref";
import { PoStatusPill } from "@/modules/purchase-orders/components/purchase-orders-ui";
import { cn } from "@/lib/utils";

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

function buildTimeline(po: ErpPurchaseOrderDetail) {
  const events: Array<{
    id: string;
    title: string;
    detail: string;
    tone: "done" | "current" | "pending" | "warn";
  }> = [
    {
      id: "created",
      title: "PO created",
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

  if (["accepted", "delivered", "partially_received", "fully_received"].includes(status)) {
    events.push({
      id: "accepted",
      title: "Vendor accepted",
      detail: "Vendor committed on portal.",
      tone: "done",
    });
  }

  if (status === "delivered") {
    events.push({
      id: "vendor-delivered",
      title: "Vendor marked delivered",
      detail: "Signal only — enter actual quantities and submit below.",
      tone: "current",
    });
  }

  if (po.linked_bill) {
    events.push({
      id: "draft-invoice",
      title:
        po.linked_bill.status === "draft"
          ? "Draft invoice generated"
          : "Invoice finalized",
      detail:
        po.linked_bill.status === "draft"
          ? "Draft only — not in accounting or inventory until delivery is submitted."
          : `Posted to accounting for ${formatCurrencyAmount(po.linked_bill.total_amount)}.`,
      tone: po.linked_bill.status === "draft" ? "current" : "done",
    });
  }

  if (po.delivery.deliverySubmitted) {
    const hasVariance = po.discrepancies.some(
      (d) => d.varianceVsOrder !== 0 || d.varianceVsOriginalBill !== 0,
    );
    events.push({
      id: "submitted",
      title: "Delivery submitted & invoice finalized",
      detail: hasVariance
        ? "Stock and accounting posted. Quantity variances recorded below."
        : "Stock and accounting posted at delivered quantities.",
      tone: "done",
    });
  } else if (po.delivery.hasDraftBill) {
    events.push({
      id: "awaiting-delivery",
      title: "Awaiting delivery submission",
      detail: "Enter delivered quantities and click Submit deliver & finalize invoice.",
      tone: "pending",
    });
  }

  return events;
}

export function PurchaseOrderDetailErpView({ poId }: { poId: string }) {
  const [pending, startTransition] = useTransition();
  const [po, setPo] = useState<ErpPurchaseOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deliveredQty, setDeliveredQty] = useState<Record<string, number>>({});
  const [receiveDate, setReceiveDate] = useState(new Date().toISOString().slice(0, 10));

  function reload() {
    return adminGet<{ po: ErpPurchaseOrderDetail; auditLogs: AuditLogEntry[] }>(
      `erp/purchase-orders/${poId}`,
    ).then((res) => {
      setPo(res.po);
      setAuditLogs(res.auditLogs ?? []);
      if (res.po.delivery.canSubmitDelivery) {
        const defaults: Record<string, number> = {};
        for (const line of res.po.purchase_order_items) {
          const remaining = Math.max(
            0,
            line.quantity - Number(line.accepted_qty ?? 0),
          );
          defaults[line.id] = remaining > 0 ? remaining : line.quantity;
        }
        setDeliveredQty(defaults);
      }
    });
  }

  useEffect(() => {
    setLoading(true);
    reload()
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [poId]);

  const previewDiscrepancies = useMemo(() => {
    if (!po?.delivery.canSubmitDelivery) return [];
    return po.purchase_order_items.map((line) => {
      const billLine = po.linked_bill?.lines.find((bl) => matchPoLineToBillLine(line, bl));
      const originalBillQty = billLine?.original_quantity ?? line.quantity;
      const delivered = coalesceNumber(deliveredQty[line.id]);
      return {
        poLineId: line.id,
        productName: lineProductName(line),
        orderedQty: line.quantity,
        originalBillQty,
        deliveredQty: delivered,
        finalBillQty: delivered,
        varianceVsOrder: delivered - line.quantity,
        varianceVsOriginalBill: delivered - originalBillQty,
      };
    });
  }, [po, deliveredQty]);

  const discrepancies =
    po?.delivery.deliverySubmitted ? po.discrepancies : previewDiscrepancies;
  const hasDiscrepancies = discrepancies.some(
    (d) => d.varianceVsOrder !== 0 || d.varianceVsOriginalBill !== 0,
  );
  const timeline = po ? buildTimeline(po) : [];

  if (loading && !po) return <AdminDetailSkeleton />;
  if (!po) {
    return (
      <p className="p-4 text-sm text-destructive">
        {error ?? "Purchase order not found."}
      </p>
    );
  }

  const canEdit = po.status === "pending";
  const canCancel = po.status === "pending";
  const activeBill =
    po.linked_bill && po.linked_bill.status !== "cancelled" ? po.linked_bill : null;
  const hasOpenDraftBill = activeBill?.status === "draft";
  const hasRemainingToReceive = po.purchase_order_items.some(
    (line) => Number(line.accepted_qty ?? 0) < line.quantity,
  );
  const cancelledBill = po.linked_bill?.status === "cancelled" ? po.linked_bill : null;
  const canCreateBill =
    !hasOpenDraftBill &&
    po.status !== "cancelled" &&
    po.purchase_order_items.length > 0 &&
    (!po.linked_bill || hasRemainingToReceive);

  function handleCancel() {
    if (!confirm("Cancel this purchase order?")) return;
    startTransition(async () => {
      const res = await cancelAdminPurchaseOrderAction(poId);
      if (!res.ok) {
        setError(res.message ?? "Cancel failed");
        return;
      }
      await reload();
    });
  }

  function submitDelivery() {
    if (!po || !po.delivery.canSubmitDelivery) return;
    if (
      !confirm(
        "Submit delivery and finalize invoice? Stock and accounting will post at the entered quantities.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        setError(null);
        const storeId = po.store_id;
        if (!storeId) {
          setError("Purchase order has no store.");
          return;
        }

        const supabase = createSupabaseBrowserClient();
        const staffUserId = await resolveOutboxUserId(supabase);
        if (!staffUserId) {
          setError("You must be signed in to submit delivery.");
          return;
        }

        const deliverPayload: PurchaseOrderDeliverFinalizePayload = {
          poId,
          receiveDate,
          lines: po.purchase_order_items.map((line) => ({
            poLineId: line.id as string,
            deliveredQty: coalesceNumber(deliveredQty[line.id]),
          })),
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
        setError(e instanceof Error ? e.message : "Submit failed");
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" title={po.po_number ?? undefined}>
            {formatErpDocRef("PO", poId)}
          </h1>
          <PoStatusPill status={po.status ?? "pending"} />
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
          {canCreateBill ? (
            <Link
              href={`/admin/erp/purchase-bills?form=new&poId=${poId}`}
              className={buttonVariants()}
            >
              {cancelledBill
                ? "Re-issue draft invoice"
                : hasRemainingToReceive && activeBill?.status !== "draft"
                  ? "Generate draft invoice (remaining qty)"
                  : "Generate draft invoice"}
            </Link>
          ) : null}
          {activeBill ? (
            <Link
              href={`/admin/erp/purchase-bills/${activeBill.id}`}
              className={buttonVariants({ variant: "outline" })}
            >
              Invoice {formatErpDocRef("PB", activeBill.id)}
            </Link>
          ) : null}
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

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {po.status === "delivered" && !po.delivery.deliverySubmitted ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="py-3 text-sm text-amber-900">
            Vendor marked this PO delivered. Enter actual quantities below and submit — that is when
            stock and accounting post.
          </CardContent>
        </Card>
      ) : null}

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

      {hasDiscrepancies || po.delivery.deliverySubmitted ? (
        <Card className={hasDiscrepancies ? "border-amber-200" : undefined}>
          <CardHeader>
            <CardTitle className="text-base">
              {po.delivery.deliverySubmitted ? "Quantity discrepancies" : "Preview — bill will adjust to"}
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500">
                  <th className="pb-2 pr-4">Product</th>
                  <th className="pb-2 pr-4">Ordered</th>
                  <th className="pb-2 pr-4">Draft invoice</th>
                  <th className="pb-2 pr-4">Delivered</th>
                  <th className="pb-2 pr-4">Final invoice</th>
                  <th className="pb-2">vs order</th>
                </tr>
              </thead>
              <tbody>
                {discrepancies.map((row) => (
                  <tr key={row.poLineId} className="border-t border-slate-100">
                    <td className="py-2 pr-4">{row.productName}</td>
                    <td className="py-2 pr-4 tabular-nums">{row.orderedQty}</td>
                    <td className="py-2 pr-4 tabular-nums">{row.originalBillQty}</td>
                    <td className="py-2 pr-4 tabular-nums">{row.deliveredQty}</td>
                    <td className="py-2 pr-4 tabular-nums">{row.finalBillQty}</td>
                    <td
                      className={cn(
                        "py-2 tabular-nums font-medium",
                        row.varianceVsOrder > 0 && "text-sky-700",
                        row.varianceVsOrder < 0 && "text-amber-700",
                        row.varianceVsOrder === 0 && "text-slate-500",
                      )}
                    >
                      {row.varianceVsOrder > 0 ? "+" : ""}
                      {row.varianceVsOrder}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}

      {po.delivery.canSubmitDelivery ? (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-base">Record delivery</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-600">
              Enter what was actually delivered. Over or under vs the PO is allowed — the draft
              invoice adjusts to these quantities on submit. Nothing posts to inventory or
              accounting until you finalize.
            </p>
            <label className="block max-w-xs text-sm">
              <span className="mb-1 block text-slate-500">Delivery date</span>
              <Input type="date" value={receiveDate} onChange={(e) => setReceiveDate(e.target.value)} />
            </label>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-slate-500">
                    <th className="pb-2 pr-4">Product</th>
                    <th className="pb-2 pr-4">Ordered</th>
                    <th className="pb-2">Delivered qty</th>
                  </tr>
                </thead>
                <tbody>
                  {po.purchase_order_items.map((line) => (
                    <tr key={line.id} className="border-t border-slate-100">
                      <td className="py-2 pr-4">{lineProductName(line)}</td>
                      <td className="py-2 pr-4 tabular-nums">{line.quantity}</td>
                      <td className="py-2">
                        <NumericInput
                          min={0}
                          step="any"
                          className="max-w-[120px]"
                          value={deliveredQty[line.id] ?? Number.NaN}
                          onValueChange={(qty) =>
                            setDeliveredQty((prev) => ({
                              ...prev,
                              [line.id]: qty,
                            }))
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button disabled={pending} onClick={submitDelivery}>
              {pending ? "Submitting…" : "Submit deliver & finalize invoice"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vendor & delivery</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="text-slate-500">Vendor:</span> {po.vendors?.name ?? "—"}</p>
            <p><span className="text-slate-500">Store:</span> {po.stores?.name ?? "—"}</p>
            <p><span className="text-slate-500">PO date:</span> {po.po_date ?? "—"}</p>
            <p><span className="text-slate-500">Expected delivery:</span> {po.expected_delivery_date ?? "—"}</p>
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
            <p className="font-semibold">PO total: {formatCurrencyAmount(po.total_amount ?? 0)}</p>
            {activeBill ? (
              <p className="pt-2 text-slate-600">
                Invoice ({activeBill.status}): {formatCurrencyAmount(activeBill.total_amount)}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

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
                <th className="pb-2">Line total</th>
              </tr>
            </thead>
            <tbody>
              {po.purchase_order_items.map((line) => (
                <tr key={line.id} className="border-t border-slate-100">
                  <td className="py-2">{lineProductName(line)}</td>
                  <td className="py-2 tabular-nums">{line.quantity}</td>
                  <td className="py-2 tabular-nums">{line.accepted_qty ?? 0}</td>
                  <td className="py-2">{formatCurrencyAmount(line.price)}</td>
                  <td className="py-2">{formatCurrencyAmount(line.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

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
    </div>
  );
}
