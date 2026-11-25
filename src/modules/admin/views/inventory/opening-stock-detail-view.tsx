"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { AdminDetailSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { adminGet, adminPost } from "@/modules/admin/lib/admin-api-client";
import { AdminPageHeader, AdminPageLayout } from "@/modules/admin/ui";
import { ErpDocumentTabsLayout } from "@/modules/erp/components/erp-document-tabs-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrencyAmount } from "@/lib/format-currency";

type OpeningDetail = {
  id: string;
  opening_number: string;
  opening_date: string;
  status: string;
  note: string | null;
  total_value: number;
  stores: { name: string } | null;
  erp_opening_stock_lines: Array<{
    id: string;
    product_id: string;
    quantity: number;
    unit_cost: number;
    line_total: number;
    product_name: string;
    barcode: string | null;
  }>;
};

export function OpeningStockDetailView({ openingId }: { openingId: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<OpeningDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminGet<OpeningDetail>(`erp/opening-stock/${openingId}`)
      .then(setDetail)
      .finally(() => setLoading(false));
  }, [openingId]);

  function finalize() {
    setError(null);
    startTransition(async () => {
      try {
        await adminPost(`erp/opening-stock/${openingId}`, {});
        router.refresh();
        const updated = await adminGet<OpeningDetail>(`erp/opening-stock/${openingId}`);
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
        <p className="p-4 text-sm text-destructive">Opening stock document not found.</p>
      </AdminPageLayout>
    );
  }

  const lines = detail.erp_opening_stock_lines ?? [];

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title={detail.opening_number}
        description={`${detail.opening_date} · ${detail.status}`}
        backHref="/admin/erp/opening-stock"
        breadcrumb={[
          { label: "Opening stock", href: "/admin/erp/opening-stock" },
          { label: detail.opening_number },
        ]}
        actions={
          detail.status === "draft" ? (
            <Button onClick={finalize} disabled={pending}>
              {pending ? "Finalizing…" : "Finalize opening stock"}
            </Button>
          ) : null
        }
      />

      <ErpDocumentTabsLayout
        detailsLabel="Opening stock details"
        entityId={openingId}
        auditEntityType="opening_stock"
        showJournals
      >
        {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Store</CardTitle>
            </CardHeader>
            <CardContent>{detail.stores?.name ?? "—"}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Total value</CardTitle>
            </CardHeader>
            <CardContent>{formatCurrencyAmount(detail.total_value)}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Note</CardTitle>
            </CardHeader>
            <CardContent>{detail.note?.trim() || "—"}</CardContent>
          </Card>
        </div>

        <div className="mt-6 overflow-x-auto rounded-lg border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Unit cost</th>
                <th className="px-3 py-2 text-right">Line value</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id} className="border-t">
                  <td className="px-3 py-2">
                    {line.product_name}
                    {line.barcode ? ` (${line.barcode})` : ""}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{line.quantity}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatCurrencyAmount(line.unit_cost)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatCurrencyAmount(line.line_total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ErpDocumentTabsLayout>
    </AdminPageLayout>
  );
}