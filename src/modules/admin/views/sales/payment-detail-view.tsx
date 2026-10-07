"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import type { LucideIcon } from "lucide-react";
import {
  Calendar,
  CreditCard,
  FileText,
  Hash,
  Receipt,
  Store,
  User,
  Wallet,
} from "lucide-react";

import { paymentModeLabel } from "@/common/erp/sales-types";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { AdminPageHeader, AdminPageLayout } from "@/modules/admin/ui";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { ErpDocumentTabsLayout } from "@/modules/erp/components/erp-document-tabs-layout";
import { ErpDocumentActions } from "@/modules/erp/components/erp-document-actions";
import { formatCurrencyAmount } from "@/lib/format-currency";
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

type PaymentDetail = {
  id: string;
  user_id: string;
  payment_number: string;
  payment_date: string;
  payment_mode: string;
  total_amount: number;
  bank_charges: number;
  reference: string | null;
  notes: string | null;
  unallocated_amount: number;
  users: { name: string | null; email: string | null } | null;
  stores: { name: string } | null;
  accounts: { name: string } | null;
  bank_charges_account: { name: string } | null;
  erp_payment_allocations: Array<{
    amount: number;
    invoice_id: string;
    invoices: {
      id: string;
      invoice_number: string;
      total_amount: number;
      balance_due: number;
    } | null;
  }>;
};

function formatDisplayDate(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return format(parseISO(value), "dd MMM yyyy");
  } catch {
    return value;
  }
}

function PaymentMetric({
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

function MetaField({
  icon: Icon,
  label,
  children,
  className,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-3", className)}>
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
  warning,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className={emphasis ? "font-semibold" : "text-muted-foreground"}>{label}</span>
      <span
        className={cn(
          "tabular-nums",
          emphasis && "text-base font-semibold",
          warning && "font-semibold text-amber-700",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function PaymentDetailView({ paymentId }: { paymentId: string }) {
  const [detail, setDetail] = useState<PaymentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminGet<PaymentDetail>(`erp/payments/${paymentId}`)
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load payment"))
      .finally(() => setLoading(false));
  }, [paymentId]);

  const allocatedTotal = useMemo(
    () =>
      detail?.erp_payment_allocations.reduce((sum, row) => sum + Number(row.amount), 0) ?? 0,
    [detail],
  );

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
        <p className="text-sm text-rose-700">{error ?? "Payment not found."}</p>
      </AdminPageLayout>
    );
  }

  const paymentRef = detail.payment_number || formatErpDocRef("PR", detail.id);
  const unallocated = Number(detail.unallocated_amount);
  const bankCharges = Number(detail.bank_charges ?? 0);
  const netDeposit = detail.total_amount - bankCharges;
  const customerLabel = detail.users?.name ?? detail.users?.email ?? "—";

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title={paymentRef}
        description={`${detail.stores?.name ?? "No store"} · ${paymentModeLabel(detail.payment_mode)} · ${formatDisplayDate(detail.payment_date)}`}
        backHref="/admin/erp/payments"
        breadcrumb={[
          { label: "Payments received", href: "/admin/erp/payments" },
          { label: paymentRef },
        ]}
        actions={
          <ErpDocumentActions
            layout="bar"
            showView={false}
            viewHref={`/admin/erp/payments/${paymentId}`}
            printHref={`/admin/erp/payments/${paymentId}/print`}
          />
        }
      />

      <Card className="overflow-hidden border border-border py-0 ring-0">
        <div className="grid divide-y divide-border sm:grid-cols-2 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          <PaymentMetric
            label="Payment amount"
            value={formatCurrencyAmount(detail.total_amount)}
            icon={Wallet}
            highlight="success"
          />
          <PaymentMetric
            label="Allocated to invoices"
            value={formatCurrencyAmount(allocatedTotal)}
            icon={Receipt}
          />
          <PaymentMetric
            label="Unallocated"
            value={formatCurrencyAmount(unallocated)}
            icon={CreditCard}
            highlight={unallocated > 0 ? "warning" : "muted"}
          />
        </div>
      </Card>

      <ErpDocumentTabsLayout
        detailsLabel="Payment details"
        entityId={paymentId}
        auditEntityType="erp_payment"
        journalSourceType="customer_payment"
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="space-y-4">
            <Card className="overflow-hidden border border-border ring-0">
              <CardHeader className="border-b bg-muted/20 pb-4">
                <CardTitle className="text-base">Payment information</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-5 pt-5 sm:grid-cols-2">
                <MetaField icon={User} label="Customer">
                  <Link
                    href={`/admin/customers/${detail.user_id}`}
                    className="text-primary hover:underline"
                  >
                    {customerLabel}
                  </Link>
                </MetaField>
                <MetaField icon={Store} label="Store">
                  {detail.stores?.name ?? "—"}
                </MetaField>
                <MetaField icon={Calendar} label="Payment date">
                  {formatDisplayDate(detail.payment_date)}
                </MetaField>
                <MetaField icon={CreditCard} label="Payment mode">
                  {paymentModeLabel(detail.payment_mode)}
                </MetaField>
                <MetaField icon={Wallet} label="Deposit account">
                  {detail.accounts?.name ?? "—"}
                </MetaField>
                <MetaField icon={Hash} label="Reference">
                  {detail.reference?.trim() ? detail.reference : "—"}
                </MetaField>
                {detail.notes?.trim() ? (
                  <MetaField icon={FileText} label="Notes" className="sm:col-span-2">
                    <span className="font-normal text-muted-foreground">{detail.notes}</span>
                  </MetaField>
                ) : null}
              </CardContent>
            </Card>

            <Card className="overflow-hidden border border-border ring-0">
              <CardHeader className="border-b bg-muted/20 pb-4">
                <div>
                  <CardTitle className="text-base">Invoice allocations</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Invoices this payment was applied to
                  </p>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {detail.erp_payment_allocations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
                    <div className="flex size-11 items-center justify-center rounded-full bg-muted">
                      <Receipt className="size-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium">No invoice allocations</p>
                    <p className="max-w-sm text-sm text-muted-foreground">
                      {unallocated > 0
                        ? "This payment has an unallocated balance that can be applied to open invoices."
                        : "This payment has not been applied to any invoices."}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableHead>Invoice</TableHead>
                          <TableHead className="text-right">Invoice total</TableHead>
                          <TableHead className="text-right">Allocated</TableHead>
                          <TableHead className="text-right">Invoice balance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.erp_payment_allocations.map((allocation) => {
                          const invoice = allocation.invoices;
                          const invoiceId = invoice?.id ?? allocation.invoice_id;
                          const invoiceRef =
                            invoice?.invoice_number ??
                            (invoiceId ? formatErpDocRef("INV", invoiceId) : "—");

                          return (
                            <TableRow key={`${allocation.invoice_id}-${allocation.amount}`}>
                              <TableCell>
                                {invoiceId ? (
                                  <Link
                                    href={`/admin/erp/invoices/${invoiceId}`}
                                    className="font-medium text-primary hover:underline"
                                  >
                                    {invoiceRef}
                                  </Link>
                                ) : (
                                  invoiceRef
                                )}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">
                                {formatCurrencyAmount(invoice?.total_amount ?? 0)}
                              </TableCell>
                              <TableCell className="text-right font-semibold tabular-nums">
                                {formatCurrencyAmount(allocation.amount)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatCurrencyAmount(invoice?.balance_due ?? 0)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="h-fit overflow-hidden border border-border ring-0">
            <CardHeader className="border-b bg-muted/20 pb-4">
              <CardTitle className="text-base">Amount summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-5 text-sm">
              <TotalsRow
                label="Payment amount"
                value={formatCurrencyAmount(detail.total_amount)}
                emphasis
              />
              <TotalsRow label="Allocated" value={formatCurrencyAmount(allocatedTotal)} />
              {bankCharges > 0 ? (
                <>
                  <Separator />
                  <TotalsRow label="Bank charges" value={formatCurrencyAmount(bankCharges)} />
                  <TotalsRow label="Net deposit" value={formatCurrencyAmount(netDeposit)} />
                  {detail.bank_charges_account?.name ? (
                    <TotalsRow
                      label="Charges account"
                      value={detail.bank_charges_account.name}
                    />
                  ) : null}
                </>
              ) : null}
              <Separator />
              <TotalsRow
                label="Unallocated"
                value={formatCurrencyAmount(unallocated)}
                emphasis={unallocated > 0}
                warning={unallocated > 0}
              />
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full"
                nativeButton={false}
                render={<Link href="/admin/erp/payments" />}
              >
                Back to payments
              </Button>
            </CardContent>
          </Card>
        </div>
      </ErpDocumentTabsLayout>
    </AdminPageLayout>
  );
}
