"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AdminDetailSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { adminDelete, adminGet, adminPost } from "@/modules/admin/lib/admin-api-client";
import { AdminPageHeader, AdminPageLayout } from "@/modules/admin/ui";
import { ErpDocumentActions } from "@/modules/erp/components/erp-document-actions";
import { ErpDocumentTabsLayout } from "@/modules/erp/components/erp-document-tabs-layout";
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

type VendorCreditDetail = {
  id: string;
  credit_number: string;
  credit_date: string;
  status: string;
  total_amount: number;
  balance_remaining: number;
  reference: string | null;
  notes: string | null;
  vendors: { name: string | null } | null;
  stores: { name: string } | null;
  source_bill: { id: string; purchase_bill_number: string } | null;
  erp_vendor_credit_lines: Array<{
    product_name: string;
    quantity: number;
    unit_price: number;
    tax_rate_percent: number;
    line_total: number;
  }>;
  erp_vendor_credit_applications: Array<{
    amount: number;
    erp_purchase_bills: { purchase_bill_number: string; balance_due: number } | null;
  }>;
};

export function VendorCreditDetailView({ creditId }: { creditId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [detail, setDetail] = useState<VendorCreditDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    adminGet<VendorCreditDetail>(`erp/vendor-credits/${creditId}`)
      .then(setDetail)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [creditId]);

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
        <p className="text-sm text-destructive">Vendor credit not found.</p>
      </AdminPageLayout>
    );
  }

  const canEdit = detail.status === "draft";
  const canFinalize = detail.status === "draft";
  const canDelete = detail.status === "draft";

  function finalize() {
    setError(null);
    startTransition(async () => {
      try {
        await adminPost(`erp/vendor-credits/${creditId}`, { reduceStock: true });
        load();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Finalize failed");
      }
    });
  }

  async function deleteDraft() {
    await adminDelete(`erp/vendor-credits/${creditId}`);
    router.push("/admin/erp/vendor-credits");
  }

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title={formatErpDocRef("VC", creditId)}
        description={`${detail.credit_date} · ${detail.status}`}
        backHref="/admin/erp/vendor-credits"
        breadcrumb={[
          { label: "Vendor credits", href: "/admin/erp/vendor-credits" },
          { label: formatErpDocRef("VC", creditId) },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canFinalize ? (
              <Button disabled={pending} onClick={finalize}>
                {pending ? "Finalizing…" : "Finalize & issue"}
              </Button>
            ) : null}
            <ErpDocumentActions
              layout="bar"
              showView={false}
              viewHref={`/admin/erp/vendor-credits/${creditId}`}
              editHref={`/admin/erp/vendor-credits?form=edit&id=${creditId}`}
              canEdit={canEdit}
              canDelete={canDelete}
              deleteLabel="Delete draft"
              deleteDescription="Permanently deletes this draft vendor credit."
              onDelete={deleteDraft}
            />
          </div>
        }
      />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <ErpDocumentTabsLayout
        detailsLabel="Vendor credit details"
        entityId={creditId}
        auditEntityType="vendor_credit"
        journalSourceType="vendor_credit"
      >
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Vendor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>{detail.vendors?.name ?? "—"}</p>
            <p className="text-muted-foreground">Store: {detail.stores?.name ?? "—"}</p>
            {detail.source_bill ? (
              <p>
                Source bill:{" "}
                <Link
                  href={`/admin/erp/purchase-bills/${detail.source_bill.id}`}
                  className="text-primary hover:underline"
                  title={detail.source_bill.purchase_bill_number}
                >
                  {formatErpDocRef("PB", detail.source_bill.id)}
                </Link>
              </p>
            ) : null}
            {detail.reference ? <p>Reference: {detail.reference}</p> : null}
            {detail.notes ? <p>Notes: {detail.notes}</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Amounts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Total: {formatCurrencyAmount(detail.total_amount)}</p>
            <p className="font-semibold">
              Balance remaining: {formatCurrencyAmount(detail.balance_remaining)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Credit lines</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Tax</TableHead>
                <TableHead>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.erp_vendor_credit_lines.map((line, i) => (
                <TableRow key={i}>
                  <TableCell>{line.product_name}</TableCell>
                  <TableCell>{line.quantity}</TableCell>
                  <TableCell>{formatCurrencyAmount(line.unit_price)}</TableCell>
                  <TableCell>{line.tax_rate_percent}%</TableCell>
                  <TableCell>{formatCurrencyAmount(line.line_total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {detail.erp_vendor_credit_applications.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Applied to bills</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {detail.erp_vendor_credit_applications.map((app, i) => (
              <p key={i}>
                {app.erp_purchase_bills?.purchase_bill_number ?? "Bill"} —{" "}
                {formatCurrencyAmount(app.amount)}
              </p>
            ))}
          </CardContent>
        </Card>
      )}
      </ErpDocumentTabsLayout>
    </AdminPageLayout>
  );
}
