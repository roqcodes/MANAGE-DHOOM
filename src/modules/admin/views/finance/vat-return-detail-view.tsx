"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import type { LucideIcon } from "lucide-react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  FileCheck2,
  Loader2,
  Receipt,
  RefreshCw,
  Store,
  Trash2,
  Wallet,
} from "lucide-react";

import type { VatReturnDetailWithSources, VatReturnSourceLine } from "@/common/erp/finance-types";
import { adminDelete, adminGet, adminPatch } from "@/modules/admin/lib/admin-api-client";
import { AdminPageHeader, AdminPageLayout } from "@/modules/admin/ui";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { ErpDocumentTabsLayout } from "@/modules/erp/components/erp-document-tabs-layout";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { formatErpDocRef } from "@/lib/erp-document-ref";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

function formatDisplayDate(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return format(parseISO(value), "dd MMM yyyy");
  } catch {
    return value;
  }
}

function statusBadge(status: string) {
  if (status === "filed") {
    return (
      <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700" variant="outline">
        Filed
      </Badge>
    );
  }
  return (
    <Badge className="border-amber-200 bg-amber-50 text-amber-700" variant="outline">
      Unfiled
    </Badge>
  );
}

function TaxMetric({
  label,
  value,
  icon: Icon,
  highlight,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  highlight?: "success" | "warning" | "muted";
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 px-4 py-4 sm:px-5">
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl",
          highlight === "success" && "bg-emerald-50 text-emerald-600",
          highlight === "warning" && "bg-amber-50 text-amber-600",
          (!highlight || highlight === "muted") && "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p
          className={cn(
            "mt-0.5 truncate text-lg font-semibold tabular-nums tracking-tight",
            highlight === "success" && "text-emerald-700",
            highlight === "warning" && "text-amber-700",
          )}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function TotalsRow({
  label,
  value,
  emphasis,
  muted,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className={muted ? "text-muted-foreground" : emphasis ? "font-semibold" : "text-muted-foreground"}>
        {label}
      </span>
      <span className={cn("tabular-nums", emphasis && "text-base font-semibold")}>{value}</span>
    </div>
  );
}

function SourceDocumentsTable({
  title,
  description,
  rows,
  emptyMessage,
  partyLabel,
}: {
  title: string;
  description: string;
  rows: VatReturnSourceLine[];
  emptyMessage: string;
  partyLabel: string;
}) {
  const taxTotal = rows.reduce((sum, row) => sum + row.tax_amount, 0);

  return (
    <Card className="overflow-hidden border border-border ring-0">
      <CardHeader className="border-b bg-muted/20 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Tax total</p>
            <p className="text-sm font-semibold tabular-nums">{formatCurrencyAmount(taxTotal)}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>{partyLabel}</TableHead>
                <TableHead className="text-right">Tax</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link href={row.href} className="font-medium text-primary hover:underline">
                      {row.document_number}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDisplayDate(row.document_date)}
                  </TableCell>
                  <TableCell className="max-w-[160px] truncate">{row.party_name ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrencyAmount(row.tax_amount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrencyAmount(row.total_amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function VatReturnDetailView({ returnId }: { returnId: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<VatReturnDetailWithSources | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, startActing] = useTransition();

  const load = useCallback(() => {
    setLoading(true);
    adminGet<VatReturnDetailWithSources>(`erp/vat-returns/${returnId}`)
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load VAT return"))
      .finally(() => setLoading(false));
  }, [returnId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <AdminPageLayout>
        <AdminPageSkeleton />
      </AdminPageLayout>
    );
  }

  if (error || !detail) {
    return (
      <AdminPageLayout>
        <p className="text-sm text-rose-700">{error ?? "VAT return not found."}</p>
      </AdminPageLayout>
    );
  }

  const returnRef = detail.return_number || formatErpDocRef("VR", detail.id);
  const paidTotal = detail.sources.payments.reduce((sum, row) => sum + row.amount, 0);

  function handleFile() {
    if (!confirm("File this VAT return?")) return;
    startActing(async () => {
      try {
        await adminPatch(`erp/vat-returns/${returnId}`, { action: "file" });
        load();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Couldn't file VAT return");
      }
    });
  }

  function handleRefresh() {
    startActing(async () => {
      try {
        const updated = await adminPatch<VatReturnDetailWithSources>(`erp/vat-returns/${returnId}`, {
          action: "refresh",
        });
        setDetail(updated);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Couldn't recalculate VAT return");
      }
    });
  }

  function handleDelete() {
    if (!confirm("Delete this unfiled VAT return? This cannot be undone.")) return;
    startActing(async () => {
      try {
        await adminDelete(`erp/vat-returns/${returnId}`);
        router.push("/admin/erp/vat-returns");
      } catch (err) {
        alert(err instanceof Error ? err.message : "Couldn't delete VAT return");
      }
    });
  }

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title={returnRef}
        description={`${detail.period_label} · ${detail.store_name ?? "No store"} · ${formatDisplayDate(detail.period_start)} – ${formatDisplayDate(detail.period_end)}`}
        backHref="/admin/erp/vat-returns"
        breadcrumb={[
          { label: "VAT returns", href: "/admin/erp/vat-returns" },
          { label: returnRef },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {detail.status === "unfiled" ? (
              <>
                <Button size="sm" disabled={acting} onClick={handleFile}>
                  File tax
                </Button>
                <Button
                  size="icon-sm"
                  variant="outline"
                  disabled={acting}
                  onClick={handleRefresh}
                  aria-label="Recalculate VAT return"
                  title="Recalculate"
                >
                  {acting ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                </Button>
                <Button
                  size="icon-sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  disabled={acting}
                  onClick={handleDelete}
                  aria-label="Delete VAT return"
                  title="Delete"
                >
                  <Trash2 />
                </Button>
              </>
            ) : null}
            {detail.status === "filed" && detail.balance_due > 0 ? (
              <Button
                nativeButton={false}
                size="sm"
                render={
                  <Link
                    href={`/admin/erp/vat-returns?vatReturnId=${encodeURIComponent(returnId)}&form=new`}
                  />
                }
              >
                Add payment
              </Button>
            ) : null}
          </div>
        }
      />

      <Card className="overflow-hidden border border-border py-0 ring-0">
        <div className="grid divide-y divide-border sm:grid-cols-2 xl:grid-cols-4 xl:divide-x xl:divide-y-0">
          <TaxMetric
            label="Output tax"
            value={formatCurrencyAmount(detail.output_tax)}
            icon={ArrowUpRight}
          />
          <TaxMetric
            label="Input tax"
            value={formatCurrencyAmount(detail.input_tax)}
            icon={ArrowDownLeft}
          />
          <TaxMetric
            label="Tax payable"
            value={formatCurrencyAmount(detail.total_tax_payable)}
            icon={Receipt}
            highlight={detail.total_tax_payable > 0 ? "warning" : "muted"}
          />
          <TaxMetric
            label="Balance due"
            value={formatCurrencyAmount(detail.balance_due)}
            icon={Wallet}
            highlight={detail.balance_due > 0 ? "warning" : "success"}
          />
        </div>
      </Card>

      <ErpDocumentTabsLayout
        detailsLabel="Tax details"
        entityId={returnId}
        auditEntityType="vat_return"
        showJournals={false}
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="space-y-4">
            <SourceDocumentsTable
              title="Sales invoices"
              description="Output tax from issued invoices in this period"
              rows={detail.sources.sales_invoices}
              emptyMessage="No taxable sales invoices in this period."
              partyLabel="Customer"
            />
            <SourceDocumentsTable
              title="Credit notes"
              description="Reduces output tax in this period"
              rows={detail.sources.credit_notes}
              emptyMessage="No credit notes in this period."
              partyLabel="Customer"
            />
            <SourceDocumentsTable
              title="Purchase bills"
              description="Input tax from finalized purchase bills in this period"
              rows={detail.sources.purchase_bills}
              emptyMessage="No taxable purchase bills in this period."
              partyLabel="Vendor"
            />
            <SourceDocumentsTable
              title="Vendor credits"
              description="Reduces input tax in this period"
              rows={detail.sources.vendor_credits}
              emptyMessage="No vendor credits in this period."
              partyLabel="Vendor"
            />

            <Card className="overflow-hidden border border-border ring-0">
              <CardHeader className="border-b bg-muted/20 pb-4">
                <CardTitle className="text-base">VAT payments</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Payments recorded against this return
                </p>
              </CardHeader>
              <CardContent className="p-0">
                {detail.sources.payments.length === 0 ? (
                  <p className="px-6 py-8 text-center text-sm text-muted-foreground">
                    No VAT payments recorded yet.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Payment</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.sources.payments.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">
                            {row.payment_number || formatErpDocRef("VP", row.id)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDisplayDate(row.payment_date)}
                          </TableCell>
                          <TableCell>{row.payment_type}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCurrencyAmount(row.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="overflow-hidden border border-border ring-0">
              <CardHeader className="border-b bg-muted/20 pb-4">
                <CardTitle className="text-base">Return summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">Status</span>
                  {statusBadge(detail.status)}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="size-4 text-muted-foreground" />
                  <span>
                    {formatDisplayDate(detail.period_start)} – {formatDisplayDate(detail.period_end)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Store className="size-4 text-muted-foreground" />
                  <span>{detail.store_name ?? "—"}</span>
                </div>
                {detail.filed_date ? (
                  <div className="flex items-center gap-2 text-sm">
                    <FileCheck2 className="size-4 text-muted-foreground" />
                    <span>Filed {formatDisplayDate(detail.filed_date)}</span>
                  </div>
                ) : null}
                <Separator />
                <TotalsRow label="Output tax" value={formatCurrencyAmount(detail.output_tax)} />
                <TotalsRow label="Input tax" value={formatCurrencyAmount(detail.input_tax)} />
                <TotalsRow
                  label="Tax payable"
                  value={formatCurrencyAmount(detail.total_tax_payable)}
                  emphasis
                />
                {detail.recoverable_tax > 0 ? (
                  <TotalsRow
                    label="Recoverable credit"
                    value={formatCurrencyAmount(detail.recoverable_tax)}
                    muted
                  />
                ) : null}
                <TotalsRow label="Paid" value={formatCurrencyAmount(paidTotal)} />
                <TotalsRow
                  label="Balance due"
                  value={formatCurrencyAmount(detail.balance_due)}
                  emphasis
                />
              </CardContent>
            </Card>

            <Card className="overflow-hidden border border-border ring-0">
              <CardHeader className="border-b bg-muted/20 pb-4">
                <CardTitle className="text-base">Notes</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {detail.notes?.trim() || "No notes."}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </ErpDocumentTabsLayout>
    </AdminPageLayout>
  );
}
