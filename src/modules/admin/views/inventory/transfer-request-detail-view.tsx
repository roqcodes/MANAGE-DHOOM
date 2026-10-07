"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AdminDetailSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { adminGet, adminPost } from "@/modules/admin/lib/admin-api-client";
import { AdminPageHeader, AdminPageLayout } from "@/modules/admin/ui";
import { ErpDocumentTabsLayout } from "@/modules/erp/components/erp-document-tabs-layout";
import { StatusBadge } from "@/modules/admin/components/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrencyAmount } from "@/lib/format-currency";

type RequestDetail = {
  id: string;
  request_number: string;
  request_date: string;
  status: string;
  note: string | null;
  from_store_id: string;
  to_store_id: string;
  transfer_id: string | null;
  erp_transfer_request_lines: Array<{
    id: string;
    variant_id: string;
    quantity: number;
    source_available: number;
    transfer_price: number;
    sales_price: number;
    average_purchase_cost: number;
    product_variants: {
      name: string | null;
      barcode: string | null;
      products: { name: string | null } | null;
    } | null;
  }>;
};

export function TransferRequestDetailView({
  requestId,
  approvalMode = false,
}: {
  requestId: string;
  approvalMode?: boolean;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [storeNames, setStoreNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function load() {
    Promise.all([
      adminGet<RequestDetail>(`erp/transfer-requests/${requestId}`),
      adminGet<{ data: Array<{ id: string; name: string }> }>("erp/stores"),
    ])
      .then(([request, storesRes]) => {
        setDetail(request);
        const map: Record<string, string> = {};
        for (const s of storesRes.data ?? []) map[s.id] = s.name;
        setStoreNames(map);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [requestId]);

  function approve() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await adminPost<{ transferId: string }>(`erp/transfer-requests/${requestId}`, {
          action: "approve",
        });
        router.push(
          `/admin/erp/transfer-bulk-payments/new?transferId=${encodeURIComponent(res.transferId)}`,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Approval failed");
      }
    });
  }

  function reject() {
    if (!confirm("Reject this transfer request?")) return;
    setError(null);
    startTransition(async () => {
      try {
        await adminPost(`erp/transfer-requests/${requestId}`, { action: "reject" });
        load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Rejection failed");
      }
    });
  }

  if (loading) {
    return (
      <AdminPageLayout>
        <AdminDetailSkeleton />
      </AdminPageLayout>
    );
  }

  if (!detail) {
    return (
      <AdminPageLayout>
        <p className="text-sm text-destructive">Request not found.</p>
      </AdminPageLayout>
    );
  }

  const lineLabel = (line: RequestDetail["erp_transfer_request_lines"][number]) => {
    const pv = line.product_variants;
    return pv?.products?.name
      ? `${pv.products.name}${pv.name ? ` — ${pv.name}` : ""}`
      : pv?.name ?? line.variant_id;
  };

  const listHref = approvalMode ? "/admin/erp/transfer-approvals" : "/admin/erp/transfer-requests";
  const listLabel = approvalMode ? "Approvals" : "Transfer requests";

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title={detail.request_number}
        description={`${detail.request_date} · ${detail.status}`}
        backHref={listHref}
        breadcrumb={[
          { label: listLabel, href: listHref },
          { label: detail.request_number },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            {detail.status === "submitted" && approvalMode ? (
              <>
                <Button disabled={pending} onClick={approve}>Approve & move stock</Button>
                <Button variant="outline" disabled={pending} onClick={reject}>Reject</Button>
              </>
            ) : null}
            {detail.status === "approved" && detail.transfer_id ? (
              <Link
                href={`/admin/erp/transfer-bulk-payments/new?transferId=${detail.transfer_id}`}
                className={buttonVariants()}
              >
                Record payment
              </Link>
            ) : null}
          </div>
        }
      />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <ErpDocumentTabsLayout
        detailsLabel="Request details"
        entityId={requestId}
        auditEntityType="transfer_request"
        showJournals={false}
      >
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Supplying store</CardTitle>
          </CardHeader>
          <CardContent>{storeNames[detail.from_store_id] ?? "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Requesting store</CardTitle>
          </CardHeader>
          <CardContent>{storeNames[detail.to_store_id] ?? "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Request date</CardTitle>
          </CardHeader>
          <CardContent>{detail.request_date}</CardContent>
        </Card>
      </div>

      {detail.note ? <p className="text-sm text-muted-foreground">Note: {detail.note}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Requested items</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Qty</th>
                <th className="px-3 py-2">Available at supply</th>
                <th className="px-3 py-2">Transfer price</th>
                <th className="px-3 py-2">Line total</th>
              </tr>
            </thead>
            <tbody>
              {detail.erp_transfer_request_lines.map((line) => (
                <tr key={line.id} className="border-t">
                  <td className="px-3 py-2">{lineLabel(line)}</td>
                  <td className="px-3 py-2 tabular-nums">{line.quantity}</td>
                  <td className="px-3 py-2 tabular-nums">{line.source_available}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatCurrencyAmount(line.transfer_price)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatCurrencyAmount(line.quantity * line.transfer_price)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      </ErpDocumentTabsLayout>
    </AdminPageLayout>
  );
}
