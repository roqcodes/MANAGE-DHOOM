"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AdminDetailSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { adminDelete, adminGet, adminPost } from "@/modules/admin/lib/admin-api-client";
import { ErpDocumentTabsLayout } from "@/modules/erp/components/erp-document-tabs-layout";
import { ErpDocumentActions } from "@/modules/erp/components/erp-document-actions";
import { AdminPageHeader, AdminPageLayout } from "@/modules/admin/ui";
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

type CreditNoteDetail = {
  id: string;
  credit_note_number: string;
  credit_note_date: string;
  status: string;
  total_amount: number;
  balance_remaining: number;
  reference: string | null;
  notes: string | null;
  attachment_url: string | null;
  users: { name: string | null } | null;
  stores: { name: string } | null;
  source_invoice: { id: string; invoice_number: string } | null;
  erp_credit_note_lines: Array<{
    id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    tax_rate_percent: number;
    line_total: number;
  }>;
};

export function CreditNoteDetailView({ creditNoteId }: { creditNoteId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [detail, setDetail] = useState<CreditNoteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    adminGet<CreditNoteDetail>(`erp/credit-notes/${creditNoteId}`)
      .then(setDetail)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [creditNoteId]);

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
        <p className="text-sm text-destructive">Credit note not found.</p>
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
        await adminPost(`erp/credit-notes/${creditNoteId}`, { restoreStock: true });
        load();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Finalize failed");
      }
    });
  }

  async function deleteDraft() {
    await adminDelete(`erp/credit-notes/${creditNoteId}`);
    router.push("/admin/erp/credit-notes");
  }

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title={formatErpDocRef("CN", creditNoteId)}
        description={`${detail.credit_note_date} · ${detail.status}`}
        backHref="/admin/erp/credit-notes"
        breadcrumb={[
          { label: "Credit notes", href: "/admin/erp/credit-notes" },
          { label: formatErpDocRef("CN", creditNoteId) },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ErpDocumentActions
              layout="bar"
              showView={false}
              viewHref={`/admin/erp/credit-notes/${creditNoteId}`}
              editHref={`/admin/erp/credit-notes?form=edit&id=${creditNoteId}`}
              printHref={`/admin/erp/credit-notes/${creditNoteId}/print`}
              canEdit={canEdit}
              canDelete={canDelete}
              deleteLabel="Delete draft"
              deleteDescription="Permanently deletes this draft credit note."
              onDelete={deleteDraft}
            />
            {canFinalize ? (
              <Button disabled={pending} onClick={finalize}>
                {pending ? "Finalizing…" : "Finalize & issue"}
              </Button>
            ) : null}
          </div>
        }
      />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <ErpDocumentTabsLayout
        detailsLabel="Credit note details"
        entityId={creditNoteId}
        auditEntityType="credit_note"
        journalSourceType="credit_note"
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Customer</CardTitle>
                </CardHeader>
                <CardContent className="text-sm font-medium">
                  {detail.users?.name ?? "—"}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Store</CardTitle>
                </CardHeader>
                <CardContent className="text-sm font-medium">
                  {detail.stores?.name ?? "—"}
                </CardContent>
              </Card>
              {detail.source_invoice ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground">Source invoice</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm">
                    <Link
                      href={`/admin/erp/invoices/${detail.source_invoice.id}`}
                      className="font-medium text-primary hover:underline"
                      title={detail.source_invoice.invoice_number}
                    >
                      {formatErpDocRef("INV", detail.source_invoice.id)}
                    </Link>
                  </CardContent>
                </Card>
              ) : null}
              {detail.reference ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground">Reference</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm">{detail.reference}</CardContent>
                </Card>
              ) : null}
              {detail.attachment_url ? (
                <Card className="sm:col-span-2">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground">Attachment</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <a
                      href={detail.attachment_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      View attachment
                    </a>
                  </CardContent>
                </Card>
              ) : null}
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Line items</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">Tax%</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.erp_credit_note_lines.map((line, index) => (
                      <TableRow key={line.id}>
                        <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                        <TableCell className="font-medium">{line.product_name}</TableCell>
                        <TableCell className="text-right tabular-nums">{line.quantity}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrencyAmount(line.unit_price)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {line.tax_rate_percent}%
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatCurrencyAmount(line.line_total)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Total</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Credit note total</span>
                <span className="font-semibold tabular-nums">
                  {formatCurrencyAmount(detail.total_amount)}
                </span>
              </div>
              <div className="flex justify-between border-t pt-3">
                <span className="text-muted-foreground">Balance remaining</span>
                <span className="text-base font-semibold tabular-nums text-primary">
                  {formatCurrencyAmount(detail.balance_remaining)}
                </span>
              </div>
              <p className="border-t pt-3 text-xs text-muted-foreground">
                Credit notes linked to a source invoice automatically reduce that invoice balance
                (Winner-style). Stock and accounts are adjusted on issue.
              </p>
            </CardContent>
          </Card>
        </div>
      </ErpDocumentTabsLayout>
    </AdminPageLayout>
  );
}
