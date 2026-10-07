"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AdminDetailSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { adminDelete, adminGet, adminPost } from "@/modules/admin/lib/admin-api-client";
import { AdminPageHeader, AdminPageLayout } from "@/modules/admin/ui";
import { StatusBadge } from "@/modules/admin/components/status-badge";
import { ErpDocumentTabsLayout } from "@/modules/erp/components/erp-document-tabs-layout";
import { ErpDocumentActions } from "@/modules/erp/components/erp-document-actions";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { formatErpDocRef } from "@/lib/erp-document-ref";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type EstimateDetail = {
  id: string;
  estimate_number: string;
  status: string;
  subtotal: number;
  tax_amount: number;
  discount: number;
  total_amount: number;
  estimate_date: string;
  valid_until: string | null;
  notes: string | null;
  reference: string | null;
  tax_inclusive: boolean;
  converted_invoice_id: string | null;
  editable?: boolean;
  users: { name: string | null; email: string | null; company_name: string | null } | null;
  stores: { name: string } | null;
  erp_estimate_lines: Array<{
    id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    tax_rate_percent: number;
    tax_amount: number;
    line_total: number;
    description: string | null;
  }>;
};

export function EstimateDetailView({ estimateId }: { estimateId: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<EstimateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [converting, startConvert] = useTransition();
  const [convertError, setConvertError] = useState<string | null>(null);

  function reload() {
    return adminGet<EstimateDetail>(`erp/estimates/${estimateId}`).then(setDetail);
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, [estimateId]);

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
        <p className="text-sm text-destructive">Estimate not found.</p>
      </AdminPageLayout>
    );
  }

  const canEdit = detail.editable ?? false;
  const canCancel = canEdit && detail.status !== "converted";
  const canConvert = detail.status === "draft" || detail.status === "sent";

  function handleConvert() {
    setConvertError(null);
    startConvert(async () => {
      try {
        const res = await adminPost<{ invoiceId: string }>(`erp/estimates/${estimateId}/convert`, {});
        router.push(`/admin/erp/invoices/${res.invoiceId}`);
      } catch (err) {
        setConvertError(err instanceof Error ? err.message : "Failed to convert estimate");
      }
    });
  }

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title={formatErpDocRef("EST", detail.id)}
        description={`${detail.estimate_date} · ${detail.status}${detail.tax_inclusive ? " · Tax inclusive" : " · Tax exclusive"}`}
        backHref="/admin/erp/estimates"
        breadcrumb={[
          { label: "Estimates", href: "/admin/erp/estimates" },
          { label: formatErpDocRef("EST", detail.id) },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canConvert ? (
              <Button disabled={converting} onClick={handleConvert}>
                {converting ? "Converting…" : "Convert to invoice"}
              </Button>
            ) : null}
            <ErpDocumentActions
              layout="bar"
              showView={false}
              viewHref={`/admin/erp/estimates/${detail.id}`}
              editHref={`/admin/erp/estimates?form=edit&id=${detail.id}`}
              printHref={`/admin/erp/estimates/${detail.id}/print`}
              emailConfig={{
                documentType: "estimate",
                documentId: detail.id,
                documentNumber: detail.estimate_number,
                defaultEmail: detail.users?.email,
                amount: detail.total_amount,
                printUrl: `/admin/erp/estimates/${detail.id}/print`,
              }}
              canEdit={canEdit}
              canDelete={canCancel}
              deleteLabel="Cancel estimate"
              deleteDescription="Marks this estimate as cancelled. It cannot be converted after cancellation."
              onDelete={async () => {
                await adminDelete(`erp/estimates/${detail.id}`);
                router.push("/admin/erp/estimates");
              }}
            />
          </div>
        }
      />

      <ErpDocumentTabsLayout
        detailsLabel="Estimate details"
        entityId={estimateId}
        auditEntityType="estimate"
        showJournals={false}
      >
        <div className="space-y-4">
          {detail.converted_invoice_id ? (
            <Card className="border-emerald-200 bg-emerald-50/50">
              <CardContent className="py-4 text-sm">
                Converted to{" "}
                <Link
                  href={`/admin/erp/invoices/${detail.converted_invoice_id}`}
                  className="font-semibold text-primary hover:underline"
                >
                  invoice
                </Link>
                .
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Estimate</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Estimate #</p>
                  <p className="font-semibold">{detail.estimate_number}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Estimate date</p>
                  <p className="font-semibold">{detail.estimate_date}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Expiry date</p>
                  <p className="font-semibold">{detail.valid_until ?? "—"}</p>
                </div>
              </div>

              <div className="grid gap-4 border-t pt-4 sm:grid-cols-2 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Seller</p>
                  <p className="font-medium">{detail.stores?.name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Customer</p>
                  <p className="font-medium">
                    {detail.users?.name ?? detail.users?.email ?? "—"}
                  </p>
                  {detail.users?.company_name ? (
                    <p className="text-muted-foreground">{detail.users.company_name}</p>
                  ) : null}
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Tax %</TableHead>
                      <TableHead className="text-right">Tax</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.erp_estimate_lines.map((item, index) => (
                      <TableRow key={item.id}>
                        <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                        <TableCell>
                          <p className="font-medium">{item.product_name}</p>
                          {item.description ? (
                            <p className="text-xs text-muted-foreground">{item.description}</p>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrencyAmount(item.unit_price)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {item.tax_rate_percent}%
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrencyAmount(item.tax_amount)}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatCurrencyAmount(item.line_total)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-end border-t pt-4">
                <div className="w-full max-w-xs space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sub total</span>
                    <span className="tabular-nums">{formatCurrencyAmount(detail.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tax</span>
                    <span className="tabular-nums">{formatCurrencyAmount(detail.tax_amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Discount</span>
                    <span className="tabular-nums">{formatCurrencyAmount(detail.discount)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 text-base font-semibold">
                    <span>Net amount</span>
                    <span className="tabular-nums">{formatCurrencyAmount(detail.total_amount)}</span>
                  </div>
                </div>
              </div>

              {detail.notes ? (
                <div className="border-t pt-4 text-sm">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Notes</p>
                  <p className="mt-1">{detail.notes}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {canConvert ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={handleConvert} disabled={converting}>
                {converting ? "Converting…" : "Convert to invoice"}
              </Button>
              {convertError ? <p className="text-sm text-destructive">{convertError}</p> : null}
            </div>
          ) : null}
        </div>
      </ErpDocumentTabsLayout>
    </AdminPageLayout>
  );
}
