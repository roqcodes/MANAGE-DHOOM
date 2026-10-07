"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AdminDetailSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { adminGet, adminPost } from "@/modules/admin/lib/admin-api-client";
import { AdminPageHeader, AdminPageLayout } from "@/modules/admin/ui";
import { ErpDocumentTabsLayout } from "@/modules/erp/components/erp-document-tabs-layout";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrencyAmount } from "@/lib/format-currency";

type AdjustmentDetail = {
  id: string;
  adjustment_number: string;
  adjustment_date: string;
  status: string;
  note: string | null;
  total_add_cost: number;
  total_remove_cost: number;
  stores: { name: string } | null;
  erp_stock_adjustment_lines: Array<{
    id: string;
    variant_id: string;
    direction: string;
    quantity: number;
    purchase_cost: number;
    line_total: number;
  }>;
};

export function StockAdjustmentDetailView({ adjustmentId }: { adjustmentId: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<AdjustmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminGet<AdjustmentDetail>(`erp/stock-adjustments/${adjustmentId}`)
      .then(setDetail)
      .finally(() => setLoading(false));
  }, [adjustmentId]);

  function finalize() {
    setError(null);
    startTransition(async () => {
      try {
        await adminPost(`erp/stock-adjustments/${adjustmentId}`, {});
        router.refresh();
        const updated = await adminGet<AdjustmentDetail>(`erp/stock-adjustments/${adjustmentId}`);
        setDetail(updated);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Finalize failed");
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
        <p className="p-4 text-sm text-destructive">Adjustment not found.</p>
      </AdminPageLayout>
    );
  }

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title={detail.adjustment_number}
        description={`${detail.adjustment_date} · ${detail.status}`}
        backHref="/admin/erp/stock-adjustments"
        breadcrumb={[
          { label: "Stock adjustments", href: "/admin/erp/stock-adjustments" },
          { label: detail.adjustment_number },
        ]}
        actions={
          detail.status === "draft" ? (
            <Button onClick={finalize} disabled={pending}>
              {pending ? "Finalizing…" : "Finalize adjustment"}
            </Button>
          ) : null
        }
      />

      <ErpDocumentTabsLayout
        detailsLabel="Adjustment details"
        entityId={adjustmentId}
        auditEntityType="stock_adjustment"
        showJournals={false}
      >
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Store</CardTitle>
          </CardHeader>
          <CardContent>{detail.stores?.name ?? "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Date</CardTitle>
          </CardHeader>
          <CardContent>{detail.adjustment_date}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Note</CardTitle>
          </CardHeader>
          <CardContent>{detail.note ?? "—"}</CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Added item cost</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-semibold tabular-nums">
            {formatCurrencyAmount(detail.total_add_cost)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Removed item cost</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-semibold tabular-nums">
            {formatCurrencyAmount(detail.total_remove_cost)}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Adjustment Items</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Direction</th>
                  <th className="px-3 py-2">Qty</th>
                  <th className="px-3 py-2">Purchase cost</th>
                  <th className="px-3 py-2">Line total</th>
                </tr>
              </thead>
              <tbody>
                {detail.erp_stock_adjustment_lines.map((line) => (
                  <tr key={line.id} className="border-t">
                    <td className="px-3 py-2 capitalize">{line.direction}</td>
                    <td className="px-3 py-2 tabular-nums">{line.quantity}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {formatCurrencyAmount(line.purchase_cost)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {formatCurrencyAmount(line.line_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <Link href="/admin/erp/stock-adjustments" className={buttonVariants({ variant: "outline" })}>
        Back to list
      </Link>
      </ErpDocumentTabsLayout>
    </AdminPageLayout>
  );
}
