"use client";

import { type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Banknote,
  Calendar,
  CalendarClock,
  CreditCard,
  FileText,
  Hash,
  Receipt,
  Store,
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { paymentModeLabel } from "@/common/erp/sales-types";
import { adminDelete } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import {
  AdminDetailBodySkeleton,
  AdminMetricValueSkeleton,
  isInitialAdminLoad,
} from "@/modules/admin/components/admin-page-skeleton";
import { useAdminGetQuery } from "@/modules/admin/lib/use-admin-get-query";
import { StatusBadge } from "@/modules/admin/components/status-badge";
import { AdminPageHeader, AdminPageLayout } from "@/modules/admin/ui";
import { ErpDocumentTabsLayout } from "@/modules/erp/components/erp-document-tabs-layout";
import { ErpDocumentActions } from "@/modules/erp/components/erp-document-actions";
import { ErpInvoicePrintModal } from "@/modules/erp/components/erp-invoice-print-modal";
import { useErpInvoicePrintModal } from "@/modules/erp/components/use-erp-invoice-print-modal";
import { InvoiceChannelBadge } from "@/modules/erp/components/invoice-channel-badge";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { formatDateOnly } from "@/lib/format-date";
import { formatErpDocRef } from "@/lib/erp-document-ref";
import { cn } from "@/lib/utils";
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

type InvoiceDetail = {
  id: string;
  invoice_number: string;
  status: string;
  subtotal: number;
  total_amount: number;
  amount_paid: number;
  credits_applied: number;
  balance_due: number;
  discount: number;
  gst_amount: number;
  due_date: string | null;
  created_at: string;
  notes: string | null;
  tax_inclusive: boolean;
  source?: string | null;
  order_id?: string | null;
  editable?: boolean;
  users: { name: string | null; email: string | null; company_name: string | null } | null;
  stores: { name: string } | null;
  invoice_items: Array<{
    id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    gst_rate: number;
    gst_amount: number;
    total_amount: number;
    description: string | null;
  }>;
  erp_payment_allocations: Array<{
    amount: number;
    erp_customer_payments: {
      id: string;
      payment_number: string;
      payment_date: string;
      payment_mode: string;
      total_amount: number;
    } | null;
  }>;
  erp_credit_note_applications: Array<{
    amount: number;
    erp_credit_notes: {
      id: string;
      credit_note_number: string;
      credit_note_date: string;
    } | null;
  }>;
};

function PaymentMetric({
  label,
  value,
  icon: Icon,
  highlight,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  highlight?: "danger" | "success" | "muted";
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5 sm:px-5">
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          highlight === "danger" && "bg-rose-50 text-rose-600",
          highlight === "success" && "bg-emerald-50 text-emerald-600",
          (!highlight || highlight === "muted") && "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p
          className={cn(
            "mt-0.5 truncate text-base font-semibold tabular-nums tracking-tight sm:text-lg",
            highlight === "danger" && "text-rose-700",
            highlight === "success" && "text-emerald-700",
          )}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function MetaField({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/80">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <div className="mt-0.5 text-sm font-medium text-foreground">{children}</div>
      </div>
    </div>
  );
}

function TotalsRow({
  label,
  value,
  emphasis,
  danger,
  muted,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  danger?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-6 text-sm">
      <span
        className={cn(
          emphasis ? "font-semibold text-foreground" : "text-muted-foreground",
          muted && "text-muted-foreground",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "tabular-nums",
          emphasis && "text-base font-semibold",
          danger && "font-semibold text-rose-600",
          muted && "text-muted-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function InvoiceDetailView({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const detailPath = `erp/invoices/${invoiceId}`;
  const { openInvoicePrint, invoicePrintModalProps } = useErpInvoicePrintModal();
  const { data: detail, isPending } = useAdminGetQuery<InvoiceDetail>({ path: detailPath });
  const initialLoading = isInitialAdminLoad(isPending, Boolean(detail));

  if (initialLoading) {
    return (
      <AdminPageLayout>
        <AdminPageHeader
          title={formatErpDocRef("INV", invoiceId)}
          description="Loading invoice…"
          backHref="/admin/erp/invoices"
          breadcrumb={[
            { label: "Invoices", href: "/admin/erp/invoices" },
            { label: formatErpDocRef("INV", invoiceId) },
          ]}
        />
        <Card className="overflow-hidden border border-border py-0 ring-0">
          <div className="grid divide-y divide-border sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-y-0">
            {(
              [
                { label: "Invoice total", icon: Receipt },
                { label: "Payments received", icon: Banknote },
                { label: "Credits applied", icon: FileText },
                { label: "Balance due", icon: CreditCard },
              ] as const
            ).map((metric) => (
              <div
                key={metric.label}
                className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5 sm:px-5"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <metric.icon className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {metric.label}
                  </p>
                  <AdminMetricValueSkeleton className="mt-1.5 h-6 w-24" />
                </div>
              </div>
            ))}
          </div>
        </Card>
        <AdminDetailBodySkeleton />
      </AdminPageLayout>
    );
  }

  if (!detail) {
    return (
      <AdminPageLayout>
        <p className="text-sm text-destructive">Invoice not found.</p>
      </AdminPageLayout>
    );
  }

  const canEdit = detail.editable ?? false;
  const canCancel = detail.status !== "cancelled" && canEdit;
  const canPay =
    detail.status !== "cancelled" &&
    detail.status !== "draft" &&
    detail.balance_due > 0;

  const collected = detail.amount_paid + detail.credits_applied;
  const collectedPercent =
    detail.total_amount > 0
      ? Math.min(100, Math.round((collected / detail.total_amount) * 100))
      : 0;
  const balanceHighlight =
    detail.balance_due <= 0 ? "success" : detail.status === "overdue" ? "danger" : "muted";
  const paymentAllocations = detail.erp_payment_allocations ?? [];
  const creditApplications = detail.erp_credit_note_applications ?? [];
  const hasLedgerActivity =
    paymentAllocations.length > 0 || creditApplications.length > 0;
  const buyerName = detail.users?.name ?? detail.users?.email ?? "—";
  const orderHref = detail.order_id
    ? detail.source === "sales_order"
      ? `/admin/erp/sales-orders/${detail.order_id}`
      : `/admin/orders/${detail.order_id}`
    : null;
  const orderLabel = detail.order_id
    ? detail.source === "sales_order"
      ? formatErpDocRef("SO", detail.order_id)
      : `#${detail.order_id.slice(0, 8).toUpperCase()}`
    : null;

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title={formatErpDocRef("INV", detail.id)}
        description={`${detail.stores?.name ?? "No store"} · Invoice date ${formatDateOnly(detail.created_at)}`}
        backHref="/admin/erp/invoices"
        breadcrumb={[
          { label: "Invoices", href: "/admin/erp/invoices" },
          { label: formatErpDocRef("INV", detail.id) },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canPay ? (
              <Button
                nativeButton={false}
                render={
                  <Link
                    href={`/admin/erp/payments/new?invoiceId=${encodeURIComponent(detail.id)}`}
                  />
                }
              >
                <CreditCard data-icon="inline-start" />
                Record payment
              </Button>
            ) : null}
            <ErpDocumentActions
              layout="bar"
              showView={false}
              viewHref={`/admin/erp/invoices/${detail.id}`}
              editHref={`/admin/erp/invoices?form=edit&id=${detail.id}`}
              onPrintClick={() => openInvoicePrint(detail.id)}
              onDownloadClick={() => openInvoicePrint(detail.id, { autoDownload: true })}
              emailConfig={{
                documentType: "invoice",
                documentId: detail.id,
                documentNumber: detail.invoice_number,
                defaultEmail: detail.users?.email,
                amount: detail.total_amount,
                printUrl: `/admin/erp/invoices/${detail.id}/print`,
              }}
              canEdit={canEdit}
              canDelete={canCancel}
              deleteLabel="Cancel invoice"
              deleteDescription="Cancels the invoice and restores stock. Only allowed before payments or credit notes."
              onDelete={async () => {
                await adminDelete(`erp/invoices/${detail.id}`);
                await queryClient.invalidateQueries({
                  queryKey: adminQueryKeys.erpGet(detailPath),
                });
                router.push("/admin/erp/invoices");
              }}
            />
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={detail.status} />
        <InvoiceChannelBadge source={detail.source} />
        <span className="text-sm text-muted-foreground">
          {detail.tax_inclusive ? "Tax inclusive" : "Tax exclusive"}
          {detail.due_date ? ` · Due ${formatDateOnly(detail.due_date)}` : ""}
        </span>
      </div>

      <Card className="overflow-hidden border border-border py-0 ring-0">
        <div className="grid divide-y divide-border sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-y-0">
          <PaymentMetric
            label="Invoice total"
            value={formatCurrencyAmount(detail.total_amount)}
            icon={Receipt}
          />
          <PaymentMetric
            label="Payments received"
            value={formatCurrencyAmount(detail.amount_paid)}
            icon={Banknote}
            highlight={detail.amount_paid > 0 ? "success" : "muted"}
          />
          <PaymentMetric
            label="Credits applied"
            value={formatCurrencyAmount(detail.credits_applied)}
            icon={FileText}
            highlight={detail.credits_applied > 0 ? "success" : "muted"}
          />
          <PaymentMetric
            label="Balance due"
            value={formatCurrencyAmount(detail.balance_due)}
            icon={CreditCard}
            highlight={balanceHighlight}
          />
        </div>
        {detail.total_amount > 0 && detail.status !== "cancelled" ? (
          <div className="border-t border-border px-4 py-3 sm:px-5">
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>Collection progress</span>
              <span className="font-medium tabular-nums text-foreground">
                {collectedPercent}% collected
              </span>
            </div>
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={collectedPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Amount collected"
            >
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  detail.balance_due <= 0
                    ? "bg-emerald-500"
                    : detail.status === "overdue"
                      ? "bg-rose-500"
                      : "bg-primary",
                )}
                style={{ width: `${collectedPercent}%` }}
              />
            </div>
          </div>
        ) : null}
      </Card>

      <ErpDocumentTabsLayout
        detailsLabel="Invoice details"
        entityId={invoiceId}
        auditEntityType="invoice"
        journalSourceType="invoice"
      >
        <div className="space-y-4">
          <Card>
            <CardHeader className="border-b bg-muted/20 pb-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Tax invoice</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Parties, line items, and document totals
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Invoice #
                  </p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums">
                    {detail.invoice_number}
                  </p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-6 p-5 sm:p-6">
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                <MetaField icon={Store} label="Seller">
                  {detail.stores?.name ?? "—"}
                </MetaField>
                <MetaField icon={UserRound} label="Buyer">
                  {buyerName}
                  {detail.users?.company_name ? (
                    <p className="mt-0.5 text-xs font-normal text-muted-foreground">
                      {detail.users.company_name}
                    </p>
                  ) : null}
                  {detail.users?.email && detail.users.email !== buyerName ? (
                    <p className="mt-0.5 text-xs font-normal text-muted-foreground">
                      {detail.users.email}
                    </p>
                  ) : null}
                </MetaField>
                <MetaField icon={Calendar} label="Invoice date">
                  {formatDateOnly(detail.created_at)}
                </MetaField>
                <MetaField icon={CalendarClock} label="Due date">
                  {formatDateOnly(detail.due_date)}
                </MetaField>
                <MetaField icon={Hash} label="Channel">
                  <InvoiceChannelBadge source={detail.source} />
                </MetaField>
                {orderHref && orderLabel ? (
                  <MetaField icon={FileText} label="Linked order">
                    <Link href={orderHref} className="text-primary hover:underline">
                      {orderLabel}
                    </Link>
                  </MetaField>
                ) : null}
              </div>

              <Separator />

              <div>
                <h3 className="mb-3 text-sm font-semibold">Line items</h3>
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
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
                      {detail.invoice_items.map((item, index) => (
                        <TableRow key={item.id}>
                          <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                          <TableCell>
                            <p className="font-medium">{item.product_name}</p>
                            {item.description ? (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {item.description}
                              </p>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCurrencyAmount(item.unit_price)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {item.quantity}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {item.gst_rate}%
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCurrencyAmount(item.gst_amount)}
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">
                            {formatCurrencyAmount(item.total_amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="flex justify-end">
                <div className="w-full max-w-xs space-y-2 rounded-lg border bg-muted/20 p-4">
                  <TotalsRow
                    label="Subtotal"
                    value={formatCurrencyAmount(detail.subtotal)}
                  />
                  <TotalsRow
                    label="Tax"
                    value={formatCurrencyAmount(detail.gst_amount)}
                    muted={detail.gst_amount === 0}
                  />
                  {detail.discount > 0 ? (
                    <TotalsRow
                      label="Discount"
                      value={formatCurrencyAmount(detail.discount)}
                    />
                  ) : null}
                  <Separator className="my-1" />
                  <TotalsRow
                    label="Invoice total"
                    value={formatCurrencyAmount(detail.total_amount)}
                    emphasis
                  />
                </div>
              </div>

              {detail.notes?.trim() ? (
                <>
                  <Separator />
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Notes
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                      {detail.notes}
                    </p>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b bg-muted/20 pb-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Payments & credits</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {detail.balance_due <= 0
                      ? "This invoice is fully settled."
                      : detail.due_date
                        ? `Due ${formatDateOnly(detail.due_date)} · ${formatCurrencyAmount(detail.balance_due)} outstanding`
                        : `${formatCurrencyAmount(detail.balance_due)} outstanding`}
                  </p>
                </div>
                {canPay ? (
                  <Button
                    nativeButton={false}
                    size="sm"
                    render={
                      <Link
                        href={`/admin/erp/payments/new?invoiceId=${encodeURIComponent(detail.id)}`}
                      />
                    }
                  >
                    <CreditCard data-icon="inline-start" />
                    Record payment
                  </Button>
                ) : null}
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {!hasLedgerActivity ? (
                <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
                  <div className="flex size-11 items-center justify-center rounded-full bg-muted">
                    <Wallet className="size-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium">No payments or credits yet</p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    {canPay
                      ? "Record a customer payment or apply a credit note to reduce the balance on this invoice."
                      : detail.status === "cancelled"
                        ? "Cancelled invoices cannot receive payments."
                        : "This invoice has no payment activity recorded."}
                  </p>
                  {canPay ? (
                    <Button
                      nativeButton={false}
                      size="sm"
                      className="mt-1"
                      render={
                        <Link
                          href={`/admin/erp/payments/new?invoiceId=${encodeURIComponent(detail.id)}`}
                        />
                      }
                    >
                      Record payment
                    </Button>
                  ) : null}
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {paymentAllocations.length > 0 ? (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableHead>Payment</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Mode</TableHead>
                            <TableHead className="text-right">Allocated</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paymentAllocations.map((allocation, index) => {
                            const payment = allocation.erp_customer_payments;
                            return (
                              <TableRow key={payment?.id ?? index}>
                                <TableCell>
                                  {payment?.id ? (
                                    <Link
                                      href={`/admin/erp/payments/${payment.id}`}
                                      className="font-medium text-primary hover:underline"
                                    >
                                      {payment.payment_number ||
                                        formatErpDocRef("PR", payment.id)}
                                    </Link>
                                  ) : (
                                    "—"
                                  )}
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  {payment?.payment_date
                                    ? formatDateOnly(payment.payment_date)
                                    : "—"}
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  {payment?.payment_mode
                                    ? paymentModeLabel(payment.payment_mode)
                                    : "—"}
                                </TableCell>
                                <TableCell className="text-right font-semibold tabular-nums">
                                  {formatCurrencyAmount(allocation.amount)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  ) : null}

                  {creditApplications.length > 0 ? (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableHead>Credit note</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Applied</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {creditApplications.map((application, index) => {
                            const credit = application.erp_credit_notes;
                            return (
                              <TableRow key={credit?.id ?? index}>
                                <TableCell>
                                  {credit?.id ? (
                                    <Link
                                      href={`/admin/erp/credit-notes/${credit.id}`}
                                      className="font-medium text-primary hover:underline"
                                    >
                                      {credit.credit_note_number ||
                                        formatErpDocRef("CN", credit.id)}
                                    </Link>
                                  ) : (
                                    "—"
                                  )}
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  {credit?.credit_note_date
                                    ? formatDateOnly(credit.credit_note_date)
                                    : "—"}
                                </TableCell>
                                <TableCell className="text-right font-semibold tabular-nums">
                                  {formatCurrencyAmount(application.amount)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </ErpDocumentTabsLayout>

      <ErpInvoicePrintModal {...invoicePrintModalProps} />
    </AdminPageLayout>
  );
}
