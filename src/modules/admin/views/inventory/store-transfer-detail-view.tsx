"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";

import { adminGet, adminPost } from "@/modules/admin/lib/admin-api-client";
import { AdminPageHeader, AdminPageLayout } from "@/modules/admin/ui";
import { ErpDocumentTabsLayout } from "@/modules/erp/components/erp-document-tabs-layout";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrencyAmount } from "@/lib/format-currency";

type TransferDetail = {
  id: string;
  transfer_number: string;
  transfer_date: string;
  status: string;
  note: string | null;
  from_store_id: string;
  to_store_id: string;
  erp_store_transfer_lines: Array<{
    id: string;
    variant_id: string;
    quantity: number;
    purchase_price: number;
    sales_price: number;
    transfer_price: number;
    markup_percent: number;
    line_total: number;
  }>;
  erp_transfer_payments: Array<{
    id: string;
    payment_number: string;
    payment_date: string;
    payment_mode: string;
    amount: number;
  }>;
};

export function StoreTransferDetailView({ transferId }: { transferId: string }) {
  const [detail, setDetail] = useState<TransferDetail | null>(null);
  const [storeNames, setStoreNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function reload() {
    return adminGet<TransferDetail>(`erp/store-transfers/${transferId}`).then(setDetail);
  }

  useEffect(() => {
    Promise.all([
      adminGet<TransferDetail>(`erp/store-transfers/${transferId}`),
      adminGet<{ data: Array<{ id: string; name: string }> }>("erp/stores"),
    ])
      .then(([transfer, storesRes]) => {
        setDetail(transfer);
        const map: Record<string, string> = {};
        for (const s of storesRes.data ?? []) map[s.id] = s.name;
        setStoreNames(map);
      })
      .finally(() => setLoading(false));
  }, [transferId]);

  function runAction(action: "approve" | "complete") {
    setError(null);
    startTransition(async () => {
      try {
        await adminPost(`erp/store-transfers/${transferId}?action=${action}`, {});
        await reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed");
      }
    });
  }

  if (loading) return <p className="p-4 text-sm">Loading…</p>;
  if (!detail) return <p className="p-4 text-sm text-red-600">Transfer not found.</p>;

  const lineTotal = detail.erp_store_transfer_lines.reduce(
    (s, l) => s + Number(l.line_total ?? 0),
    0,
  );
  const paidTotal = detail.erp_transfer_payments.reduce((s, p) => s + Number(p.amount ?? 0), 0);

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title={detail.transfer_number}
        description={`${detail.transfer_date} · ${detail.status}`}
        backHref="/admin/erp/store-transfers"
        breadcrumb={[
          { label: "Store transfers", href: "/admin/erp/store-transfers" },
          { label: detail.transfer_number },
        ]}
        actions={
          <div className="flex gap-2">
            {detail.status === "draft" ? (
              <Button onClick={() => runAction("approve")} disabled={pending}>
                Approve
              </Button>
            ) : null}
            {detail.status === "approved" || detail.status === "in_transit" ? (
              <Button onClick={() => runAction("complete")} disabled={pending}>
                Complete transfer
              </Button>
            ) : null}
          </div>
        }
      />

      <ErpDocumentTabsLayout
        detailsLabel="Transfer details"
        entityId={transferId}
        auditEntityType="store_transfer"
        showJournals={false}
      >
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-500">From</CardTitle>
          </CardHeader>
          <CardContent>{storeNames[detail.from_store_id] ?? "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-500">To</CardTitle>
          </CardHeader>
          <CardContent>{storeNames[detail.to_store_id] ?? "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-500">Date</CardTitle>
          </CardHeader>
          <CardContent>{detail.transfer_date}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transfer Items</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Qty</th>
                  <th className="px-3 py-2">Purchase</th>
                  <th className="px-3 py-2">Sales</th>
                  <th className="px-3 py-2">Transfer</th>
                  <th className="px-3 py-2">Markup %</th>
                  <th className="px-3 py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {detail.erp_store_transfer_lines.map((line) => (
                  <tr key={line.id} className="border-t">
                    <td className="px-3 py-2 tabular-nums">{line.quantity}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {formatCurrencyAmount(line.purchase_price)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {formatCurrencyAmount(line.sales_price)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {formatCurrencyAmount(line.transfer_price)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{line.markup_percent}%</td>
                    <td className="px-3 py-2 tabular-nums">
                      {formatCurrencyAmount(line.line_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm font-medium">
            Transfer total: {formatCurrencyAmount(lineTotal)} · Paid:{" "}
            {formatCurrencyAmount(paidTotal)} · Balance:{" "}
            {formatCurrencyAmount(lineTotal - paidTotal)}
          </p>
        </CardContent>
      </Card>

      {detail.erp_transfer_payments.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Payments</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Number</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Mode</th>
                  <th className="px-3 py-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {detail.erp_transfer_payments.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="px-3 py-2">{p.payment_number}</td>
                    <td className="px-3 py-2">{p.payment_date}</td>
                    <td className="px-3 py-2">{p.payment_mode}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {formatCurrencyAmount(p.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <Link href="/admin/erp/store-transfers" className={buttonVariants({ variant: "outline" })}>
        Back to list
      </Link>
      </ErpDocumentTabsLayout>
    </AdminPageLayout>
  );
}
