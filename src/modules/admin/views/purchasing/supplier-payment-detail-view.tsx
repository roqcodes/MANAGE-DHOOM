"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import type { LucideIcon } from "lucide-react";
import {
  Building2,
  Calendar,
  CreditCard,
  FileText,
  Hash,
  Receipt,
  Store,
  Wallet,
} from "lucide-react";

import { paymentModeLabel } from "@/common/erp/sales-types";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { formatErpDocRef } from "@/lib/erp-document-ref";
import { cn } from "@/lib/utils";
import { AdminPageHeader, AdminPageLayout } from "@/modules/admin/ui";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { ErpDocumentTabsLayout } from "@/modules/erp/components/erp-document-tabs-layout";
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
  vendor_id: string;
  payment_number: string;
  payment_date: string;
  payment_mode: string;
  total_amount: number;
  bank_charges: number;
  reference: string | null;
  notes: string | null;
  unallocated_amount: number;
  vendors: { name: string | null } | null;
  stores: { name: string } | null;
  accounts: { name: string } | null;
  bank_charges_account: { name: string } | null;
  erp_supplier_payment_allocations: Array<{
    amount: number;
    purchase_bill_id: string;
    erp_purchase_bills: {
      id: string;
      purchase_bill_number: string;
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
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className={emphasis ? "font-semibold" : "text-muted-foreground"}>{label}</span>
      <span className={cn("tabular-nums", emphasis && "text-base font-semibold")}>{value}</span>
    </div>
  );
}

export function SupplierPaymentDetailView() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<PaymentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminGet<PaymentDetail>(`erp/supplier-payments/${id}`)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load payment"))
      .finally(() => setLoading(false));
  }, [id]);

  const allocatedTotal = useMemo(
    () =>
      data?.erp_supplier_payment_allocations.reduce((sum, row) => sum + Number(row.amount), 0) ??
      0,
    [data],
  );

  if (loading) {
    return (
      <AdminPageLayout>
        <AdminPageSkeleton />
      </AdminPageLayout>
    );
  }

  if (error || !data) {
    return (
      <AdminPageLayout>
        <p className="text-sm text-rose-700">{error ?? "Payment not found."}</p>
      </AdminPageLayout>
    );
  }

  const paymentRef = formatErpDocRef("PM", data.id);
  const unallocated = Number(data.unallocated_amount);
  const bankCharges = Number(data.bank_charges ?? 0);

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title={paymentRef}
        description={`${data.stores?.name ?? "No store"} · Paid ${formatDisplayDate(data.payment_date)}`}
        backHref="/admin/erp/supplier-payments"
        breadcrumb={[
          { label: "Payment made", href: "/admin/erp/supplier-payments" },
          { label: paymentRef },
        ]}
      />

      <Card className="overflow-hidden border border-border py-0 ring-0">
        <div className="grid divide-y divide-border sm:grid-cols-2 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          <PaymentMetric
            label="Payment amount"
            value={formatCurrencyAmount(data.total_amount)}
            icon={Wallet}
            highlight="success"
          />
          <PaymentMetric
            label="Allocated to bills"
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
        entityId={id}
        auditEntityType="supplier_payment"
        journalSourceType="supplier_payment"
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="space-y-4">
            <Card>
              <CardHeader className="border-b bg-muted/20 pb-4">
                <CardTitle className="text-base">Payment information</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-5 pt-5 sm:grid-cols-2">
                <MetaField icon={Building2} label="Vendor">
                  <Link
                    href={`/admin/vendors/${data.vendor_id}`}
                    className="text-primary hover:underline"
                  >
                    {data.vendors?.name ?? "—"}
                  </Link>
                </MetaField>
                <MetaField icon={Store} label="Store">
                  {data.stores?.name ?? "—"}
                </MetaField>
                <MetaField icon={Calendar} label="Payment date">
                  {formatDisplayDate(data.payment_date)}
                </MetaField>
                <MetaField icon={CreditCard} label="Payment mode">
                  {paymentModeLabel(data.payment_mode)}
                </MetaField>
                <MetaField icon={Wallet} label="Paid through">
                  {data.accounts?.name ?? "—"}
                </MetaField>
                <MetaField icon={Hash} label="Reference">
                  {data.reference ?? "—"}
                </MetaField>
                {data.notes ? (
                  <MetaField icon={FileText} label="Notes" className="sm:col-span-2">
                    <span className="font-normal text-muted-foreground">{data.notes}</span>
                  </MetaField>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b bg-muted/20 pb-4">
                <div>
                  <CardTitle className="text-base">Bill allocations</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Purchase bills this payment was applied to
                  </p>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {data.erp_supplier_payment_allocations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
                    <div className="flex size-11 items-center justify-center rounded-full bg-muted">
                      <Receipt className="size-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium">No bill allocations</p>
                    <p className="max-w-sm text-sm text-muted-foreground">
                      This payment has not been applied to any purchase bills yet.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableHead>Bill #</TableHead>
                          <TableHead className="text-right">Bill total</TableHead>
                          <TableHead className="text-right">Allocated</TableHead>
                          <TableHead className="text-right">Bill balance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.erp_supplier_payment_allocations.map((allocation) => {
                          const bill = allocation.erp_purchase_bills;
                          const billId = bill?.id ?? allocation.purchase_bill_id;
                          const billRef =
                            bill?.purchase_bill_number ?? (billId ? formatErpDocRef("PB", billId) : "—");

                          return (
                            <TableRow key={`${allocation.purchase_bill_id}-${allocation.amount}`}>
                              <TableCell>
                                {billId ? (
                                  <Link
                                    href={`/admin/erp/purchase-bills/${billId}`}
                                    className="font-medium text-primary hover:underline"
                                  >
                                    {billRef}
                                  </Link>
                                ) : (
                                  billRef
                                )}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">
                                {formatCurrencyAmount(bill?.total_amount ?? 0)}
                              </TableCell>
                              <TableCell className="text-right font-semibold tabular-nums">
                                {formatCurrencyAmount(allocation.amount)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatCurrencyAmount(bill?.balance_due ?? 0)}
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

          <Card className="h-fit">
            <CardHeader className="border-b bg-muted/20 pb-4">
              <CardTitle className="text-base">Amount summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-5 text-sm">
              <TotalsRow
                label="Payment amount"
                value={formatCurrencyAmount(data.total_amount)}
                emphasis
              />
              <TotalsRow
                label="Allocated"
                value={formatCurrencyAmount(allocatedTotal)}
              />
              {bankCharges > 0 ? (
                <>
                  <Separator />
                  <TotalsRow
                    label="Bank charges"
                    value={formatCurrencyAmount(bankCharges)}
                  />
                  {data.bank_charges_account?.name ? (
                    <TotalsRow
                      label="Charges account"
                      value={data.bank_charges_account.name}
                    />
                  ) : null}
                </>
              ) : null}
              <Separator />
              <TotalsRow
                label="Unallocated"
                value={formatCurrencyAmount(unallocated)}
                emphasis={unallocated > 0}
              />
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full"
                render={<Link href="/admin/erp/supplier-payments" />}
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
