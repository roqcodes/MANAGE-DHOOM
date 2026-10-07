"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { PurchaseReceiveAdjustments } from "@/common/erp/purchasing-types";
import { adminDelete, adminGet, adminPost } from "@/modules/admin/lib/admin-api-client";
import { StatusBadge } from "@/modules/admin/components/status-badge";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { displayErpDocumentNumber } from "@/lib/erp-document-ref";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminPageHeader, AdminPageLayout } from "@/modules/admin/ui";

type ReceiveDetail = {
  id: string;
  receive_number: string;
  status: string;
  document_kind?: string | null;
  reversed_by_receive_id?: string | null;
  reversal_of_id?: string | null;
  receive_date: string;
  expected_delivery_date: string | null;
  reference: string | null;
  notes: string | null;
  inventory_committed: boolean;
  reconcile_bill: boolean;
  vendor_id: string;
  store_id: string;
  po_id: string | null;
  purchase_bill_id: string | null;
  vendors: { name: string | null } | null;
  stores: { name: string | null } | null;
  purchase_orders: { po_number: string | null; status: string | null } | null;
  erp_purchase_bills: { purchase_bill_number: string | null; status: string | null } | null;
  erp_purchase_receive_lines: Array<{
    id: string;
    product_name: string;
    ordered_qty: number;
    billed_qty: number;
    received_qty: number;
    accepted_qty: number;
    rejected_qty: number;
    purchase_price: number;
    expiry_date: string | null;
    batch_reference: string | null;
  }>;
};

export function PurchaseReceiveDetailView({ receiveId }: { receiveId: string }) {
  const router = useRouter();
  const [receive, setReceive] = useState<ReceiveDetail | null>(null);
  const [adjustments, setAdjustments] = useState<PurchaseReceiveAdjustments | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reload() {
    setLoading(true);
    Promise.all([
      adminGet<{ receive: ReceiveDetail }>(`erp/purchase-receives/${receiveId}`),
      adminGet<{ adjustments: PurchaseReceiveAdjustments }>(
        `erp/purchase-receives/${receiveId}/adjustments`,
      ).catch(() => ({ adjustments: null })),
    ])
      .then(([receiveRes, adjRes]) => {
        setReceive(receiveRes.receive);
        setAdjustments(adjRes.adjustments);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
  }, [receiveId]);

  function finalize() {
    startTransition(async () => {
      try {
        await adminPost(`erp/purchase-receives/${receiveId}`, {
          reconcileBill: receive?.reconcile_bill ?? true,
        });
        reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Finalize failed");
      }
    });
  }

  function cancelDraft() {
    if (!confirm("Discard this draft receive?")) return;
    startTransition(async () => {
      try {
        await adminDelete(`erp/purchase-receives/${receiveId}`);
        router.push(
          receive?.po_id ? `/admin/purchase-orders/${receive.po_id}` : "/admin/purchase-orders",
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Cancel failed");
      }
    });
  }

  function reverseReceive() {
    const reason = window.prompt("Reason for reversing this receive (optional):") ?? "";
    if (!confirm("Reverse this receive? Stock will be removed and receive journals voided.")) {
      return;
    }
    startTransition(async () => {
      try {
        const res = await adminPost<{ reversalId: string }>(
          `erp/purchase-receives/${receiveId}/reverse`,
          { reason: reason || null },
        );
        router.push(`/admin/erp/purchase-receives/${res.reversalId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Reverse failed");
      }
    });
  }

  function createVendorCredit(kind: "shortfall" | "rejected" | "all") {
    if (!receive) return;
    const params = new URLSearchParams({ receiveId, kind });
    if (receive.purchase_bill_id) {
      params.set("billId", receive.purchase_bill_id);
    }
    router.push(`/admin/erp/vendor-credits/new?${params.toString()}`);
  }

  if (loading && !receive) return <AdminPageSkeleton />;
  if (!receive) {
    return (
      <AdminPageLayout>
        <p className="p-4 text-sm text-red-600">{error ?? "Receive not found"}</p>
      </AdminPageLayout>
    );
  }

  const vendorMarkedDelivered = receive.purchase_orders?.status === "delivered";
  const isReversal = receive.document_kind === "reversal";
  const showAdjustments =
    receive.status === "finalized" &&
    adjustments &&
    adjustments.shortfall_policy !== "ignore" &&
    (adjustments.shortfall_lines.length > 0 || adjustments.rejected_lines.length > 0);

  const poBackHref = receive.po_id ? `/admin/purchase-orders/${receive.po_id}` : "/admin/purchase-orders";

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title={displayErpDocumentNumber(receive.receive_number, "PR", receive.id)}
        breadcrumb={[
          receive.po_id
            ? { label: "Purchase order", href: poBackHref }
            : { label: "Purchase orders", href: "/admin/purchase-orders" },
          { label: displayErpDocumentNumber(receive.receive_number, "PR", receive.id) },
        ]}
        description={
          isReversal
            ? "Reversal document — audit record for undone delivery."
            : "Delivery audit record linked to purchase order."
        }
        actions={
          <>
            {receive.status === "draft" ? (
              <>
                <Button size="sm" disabled={pending} onClick={finalize}>
                  Finalize receive
                </Button>
                <Button size="sm" variant="outline" disabled={pending} onClick={cancelDraft}>
                  Discard draft
                </Button>
              </>
            ) : null}
            {receive.status === "finalized" && !isReversal ? (
              <Button size="sm" variant="destructive" disabled={pending} onClick={reverseReceive}>
                Reverse receive
              </Button>
            ) : null}
          </>
        }
      />

      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

      {vendorMarkedDelivered ? (
        <Card className="mb-4 border-amber-200 bg-amber-50">
          <CardContent className="py-3 text-sm text-amber-900">
            Vendor marked PO delivered on portal — signal only. Internal receive above is inventory authority.
          </CardContent>
        </Card>
      ) : null}

      {receive.status === "reversed" && receive.reversed_by_receive_id ? (
        <Card className="mb-4 border-slate-200 bg-slate-50">
          <CardContent className="py-3 text-sm">
            Reversed. Audit reversal:{" "}
            <Link
              href={`/admin/erp/purchase-receives/${receive.reversed_by_receive_id}`}
              className="text-primary underline-offset-2 hover:underline"
            >
              View reversal document
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {showAdjustments ? (
        <Card className="mb-4 border-blue-200">
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Billing adjustments (posted bill)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-slate-600">
              Posted bill cannot be edited. Create vendor credit for quantity/value mismatch
            </p>
            {adjustments.shortfall_lines.length > 0 ? (
              <div>
                <p className="font-medium">Short delivery vs billed qty</p>
                <ul className="mt-1 space-y-1 text-slate-600">
                  {adjustments.shortfall_lines.map((line) => (
                    <li key={line.bill_line_id}>
                      {line.product_name}: short {line.shortfall_qty} (
                      {formatCurrencyAmount(line.credit_amount)})
                    </li>
                  ))}
                </ul>
                <Button
                  size="sm"
                  className="mt-2"
                  variant="outline"
                  disabled={pending}
                  onClick={() => createVendorCredit("shortfall")}
                >
                  Create vendor credit (shortfall)
                </Button>
              </div>
            ) : null}
            {adjustments.rejected_lines.length > 0 ? (
              <div>
                <p className="font-medium">Rejected / damaged at receipt</p>
                <ul className="mt-1 space-y-1 text-slate-600">
                  {adjustments.rejected_lines.map((line, idx) => (
                    <li key={`${line.product_name}-${idx}`}>
                      {line.product_name}: rejected {line.rejected_qty} (
                      {formatCurrencyAmount(line.credit_amount)})
                    </li>
                  ))}
                </ul>
                <Button
                  size="sm"
                  className="mt-2"
                  variant="outline"
                  disabled={pending}
                  onClick={() => createVendorCredit("rejected")}
                >
                  Create vendor credit (rejected)
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card className="mb-4">
        <CardContent className="grid gap-3 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <span className="text-xs text-slate-500">Status</span>
            <div className="mt-1">
              <StatusBadge status={receive.status} />
            </div>
          </div>
          <div>
            <span className="text-xs text-slate-500">Vendor</span>
            <p>{receive.vendors?.name ?? "—"}</p>
          </div>
          <div>
            <span className="text-xs text-slate-500">Store</span>
            <p>{receive.stores?.name ?? "—"}</p>
          </div>
          <div>
            <span className="text-xs text-slate-500">Receive date</span>
            <p>{receive.receive_date}</p>
          </div>
          <div>
            <span className="text-xs text-slate-500">Expected delivery</span>
            <p>{receive.expected_delivery_date ?? "—"}</p>
          </div>
          <div>
            <span className="text-xs text-slate-500">Reference</span>
            <p>{receive.reference ?? "—"}</p>
          </div>
          {receive.po_id ? (
            <div>
              <span className="text-xs text-slate-500">PO</span>
              <p>
                <Link
                  href={`/admin/purchase-orders/${receive.po_id}`}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {displayErpDocumentNumber(
                    receive.purchase_orders?.po_number,
                    "PO",
                    receive.po_id,
                  )}
                </Link>
              </p>
            </div>
          ) : null}
          {receive.purchase_bill_id ? (
            <div>
              <span className="text-xs text-slate-500">Purchase bill</span>
              <p>
                <Link
                  href={`/admin/erp/purchase-bills/${receive.purchase_bill_id}`}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {displayErpDocumentNumber(
                    receive.erp_purchase_bills?.purchase_bill_number,
                    "PB",
                    receive.purchase_bill_id,
                  )}
                </Link>
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {receive.erp_purchase_receive_lines.map((line) => (
          <Card key={line.id}>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">{line.product_name}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
              <div><span className="text-slate-500">Ordered</span><p>{line.ordered_qty}</p></div>
              <div><span className="text-slate-500">Billed</span><p>{line.billed_qty || "—"}</p></div>
              <div><span className="text-slate-500">Received</span><p>{line.received_qty}</p></div>
              <div><span className="text-slate-500">Accepted</span><p>{line.accepted_qty}</p></div>
              <div><span className="text-slate-500">Rejected</span><p>{line.rejected_qty}</p></div>
              <div><span className="text-slate-500">Rate</span><p>{line.purchase_price}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      {receive.notes ? (
        <p className="mt-4 text-sm text-slate-600">{receive.notes}</p>
      ) : null}

      <div className="mt-6">
        <Link href={poBackHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Back to purchase order
        </Link>
      </div>
    </AdminPageLayout>
  );
}
