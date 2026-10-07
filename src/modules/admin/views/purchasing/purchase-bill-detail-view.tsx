"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import type { LucideIcon } from "lucide-react";
import {
  Building2,
  Calendar,
  CalendarClock,
  CreditCard,
  FileText,
  Hash,
  Package,
  Receipt,
  Store,
  Truck,
  Wallet,
} from "lucide-react";

import { derivePurchaseBillDisplayStatus } from "@/common/erp/purchasing-types";
import { createSupabaseBrowserClient } from "@/lib/integrations/supabase/client";
import { ERP_CLIENT_OPERATION_TYPES } from "@/lib/erp/client-operations/operation-types";
import { dispatchOutboxChanged } from "@/lib/sync/outbox-browser-events";
import { OutboxEnqueueError } from "@/lib/sync/outbox-errors";
import { createOutboxStore } from "@/lib/sync/outbox-store";
import { getOrCreateErpTerminalId } from "@/lib/sync/erp-terminal-id";
import { broadcastSyncWake } from "@/lib/sync/sync-network";
import { resolveOutboxUserId } from "@/lib/sync/resolve-outbox-user-id.client";
import { purchaseBillResourceScope } from "@/modules/erp/types/purchase-payload";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { AdminPageHeader, AdminPageLayout } from "@/modules/admin/ui";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { ErpDocumentTabsLayout } from "@/modules/erp/components/erp-document-tabs-layout";
import { StatusBadge } from "@/modules/admin/components/status-badge";
import { ErpDocumentActions } from "@/modules/erp/components/erp-document-actions";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { formatCurrencyAmount } from "@/lib/format-currency";
import { formatErpDocRef } from "@/lib/erp-document-ref";
import { cn } from "@/lib/utils";

type BillDetail = {
  id: string;
  purchase_bill_number: string;
  vendor_bill_number: string | null;
  vendor_id: string;
  store_id: string;
  po_id: string | null;
  purchase_date: string;
  due_date: string | null;
  grn_reference: string | null;
  batch_reference: string | null;
  reference: string | null;
  notes: string | null;
  status: string;
  subtotal: number;
  tax_amount: number;
  discount: number;
  landed_cost_total: number;
  total_amount: number;
  amount_paid: number;
  credits_applied: number;
  balance_due: number;
  inventory_committed: boolean;
  accounting_posted?: boolean;
  expected_delivery_date?: string | null;
  vendors: { name: string | null; phone: string | null; address: string | null; trn: string | null } | null;
  stores: { name: string | null } | null;
  purchase_orders: { po_number: string | null } | null;
  erp_purchase_bill_lines: Array<{
    product_name: string;
    quantity: number;
    purchase_price: number;
    tax_rate_percent: number;
    tax_amount: number;
    line_total: number;
  }>;
  erp_purchase_bill_landed_costs: Array<{
    name: string;
    quantity: number;
    rate: number;
    line_total: number;
  }>;
  erp_supplier_payment_allocations: Array<{
    amount: number;
    erp_supplier_payments: {
      id: string;
      payment_number: string;
      payment_date: string;
      total_amount: number;
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

function BillMetric({
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
    <div className="flex min-w-0 flex-1 items-center gap-3 px-4 py-4 sm:px-5">
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl",
          highlight === "danger" && "bg-rose-50 text-rose-600",
          highlight === "success" && "bg-emerald-50 text-emerald-600",
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
  danger,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className={emphasis ? "font-semibold" : "text-muted-foreground"}>{label}</span>
      <span
        className={cn(
          "tabular-nums",
          emphasis && "text-base font-semibold",
          danger && "font-semibold text-rose-600",
          !danger && emphasis && "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function PurchaseBillDetailView({ billId }: { billId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [bill, setBill] = useState<BillDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    return adminGet<{ bill: BillDetail }>(`erp/purchase-bills/${billId}`).then((res) => {
      setBill(res.bill);
    });
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [billId]);

  if (loading && !bill) {
    return (
      <AdminPageLayout>
        <AdminPageSkeleton />
      </AdminPageLayout>
    );
  }

  if (!bill) {
    return (
      <AdminPageLayout>
        <p className="text-sm text-muted-foreground">Purchase bill not found.</p>
      </AdminPageLayout>
    );
  }

  const displayStatus = derivePurchaseBillDisplayStatus(
    bill.status,
    Number(bill.balance_due),
    bill.due_date,
  );
  const statusKey = displayStatus.toLowerCase();
  const canEdit = bill.status === "draft" && !bill.accounting_posted && !bill.inventory_committed;
  const canFinalize =
    bill.status === "draft" &&
    !bill.accounting_posted &&
    !bill.inventory_committed &&
    !bill.po_id;
  const canPay = bill.balance_due > 0 && bill.status !== "draft" && bill.status !== "cancelled";
  const canCancel =
    bill.status !== "cancelled" &&
    bill.amount_paid === 0 &&
    bill.credits_applied === 0 &&
    bill.erp_supplier_payment_allocations.length === 0;

  const balanceHighlight =
    bill.balance_due <= 0 ? "success" : statusKey === "overdue" ? "danger" : "muted";

  function finalize() {
    setError(null);
    if (!bill?.store_id) {
      setError("Bill store is missing.");
      return;
    }
    startTransition(async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const staffUserId = await resolveOutboxUserId(supabase);
        if (!staffUserId) {
          setError("You must be signed in to finalize.");
          return;
        }

        const store = createOutboxStore();
        try {
          await store.enqueue({
            operationType: ERP_CLIENT_OPERATION_TYPES.purchaseBill.finalize,
            schemaVersion: 1,
            payload: { billId },
            userId: staffUserId,
            storeId: bill.store_id,
            terminalId: getOrCreateErpTerminalId(),
            resourceScope: purchaseBillResourceScope(billId),
          });
        } catch (enqueueErr) {
          if (enqueueErr instanceof OutboxEnqueueError) {
            setError(enqueueErr.message);
          } else {
            setError(
              enqueueErr instanceof Error ? enqueueErr.message : "Could not queue finalize.",
            );
          }
          return;
        } finally {
          await store.close();
        }

        dispatchOutboxChanged();
        broadcastSyncWake();
        await load();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Finalize failed");
      }
    });
  }

  async function cancelBill() {
    if (!bill?.store_id) {
      setError("Bill store is missing.");
      return;
    }
    const supabase = createSupabaseBrowserClient();
    const staffUserId = await resolveOutboxUserId(supabase);
    if (!staffUserId) {
      setError("You must be signed in to cancel.");
      return;
    }

    const store = createOutboxStore();
    try {
      await store.enqueue({
        operationType: ERP_CLIENT_OPERATION_TYPES.purchaseBill.cancel,
        schemaVersion: 1,
        payload: { billId },
        userId: staffUserId,
        storeId: bill.store_id,
        terminalId: getOrCreateErpTerminalId(),
        resourceScope: purchaseBillResourceScope(billId),
      });
    } catch (enqueueErr) {
      if (enqueueErr instanceof OutboxEnqueueError) {
        setError(enqueueErr.message);
      } else {
        setError(enqueueErr instanceof Error ? enqueueErr.message : "Could not queue cancel.");
      }
      return;
    } finally {
      await store.close();
    }

    dispatchOutboxChanged();
    broadcastSyncWake();
    router.push("/admin/erp/purchase-bills");
  }

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title={formatErpDocRef("PB", billId)}
        description={`${bill.stores?.name ?? "No store"} · Bill date ${formatDisplayDate(bill.purchase_date)}`}
        backHref="/admin/erp/purchase-bills"
        breadcrumb={[
          { label: "Purchase bills", href: "/admin/erp/purchase-bills" },
          { label: formatErpDocRef("PB", billId) },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canFinalize ? (
              <Button disabled={pending} onClick={finalize}>
                {pending ? "Finalizing…" : "Post bill (AP only)"}
              </Button>
            ) : null}
            {canPay ? (
              <Button
                nativeButton={false}
                render={
                  <Link href={`/admin/erp/supplier-payments/new?billId=${billId}`} />
                }
              >
                <CreditCard data-icon="inline-start" />
                Add payment
              </Button>
            ) : null}
            {bill.po_id ? (
              <Button
                nativeButton={false}
                variant="outline"
                render={<Link href={`/admin/purchase-orders/${bill.po_id}`} />}
              >
                <FileText data-icon="inline-start" />
                View PO
              </Button>
            ) : null}
            <ErpDocumentActions
              layout="bar"
              showView={false}
              viewHref={`/admin/erp/purchase-bills/${billId}`}
              editHref={`/admin/erp/purchase-bills?form=edit&id=${billId}`}
              printHref={`/admin/erp/purchase-bills/${billId}/print`}
              canEdit={canEdit}
              canDelete={canCancel}
              deleteLabel="Cancel bill"
              deleteDescription="Cancels this bill. Finalized receives must be cancelled first. Legacy bills may reverse stock applied before receive engine."
              onDelete={cancelBill}
            />
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={statusKey} />
        {bill.due_date ? (
          <span className="text-sm text-muted-foreground">
            Due {formatDisplayDate(bill.due_date)}
          </span>
        ) : null}
      </div>

      <Card className="overflow-hidden border border-border py-0 ring-0">
        <div className="grid divide-y divide-border sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-y-0">
          <BillMetric
            label="Bill total"
            value={formatCurrencyAmount(bill.total_amount)}
            icon={Receipt}
          />
          <BillMetric
            label="Amount paid"
            value={formatCurrencyAmount(bill.amount_paid)}
            icon={Wallet}
            highlight={bill.amount_paid > 0 ? "success" : "muted"}
          />
          <BillMetric
            label="Balance due"
            value={formatCurrencyAmount(bill.balance_due)}
            icon={CreditCard}
            highlight={balanceHighlight}
          />
          <BillMetric
            label="Due date"
            value={formatDisplayDate(bill.due_date)}
            icon={CalendarClock}
            highlight={statusKey === "overdue" ? "danger" : "muted"}
          />
        </div>
      </Card>

      {bill.po_id && bill.status === "draft" ? (
        <Card className="border-sky-200 bg-sky-50">
          <CardContent className="py-3 text-sm text-sky-900">
            Linked to a purchase order — finalize via{" "}
            <Link href={`/admin/purchase-orders/${bill.po_id}`} className="font-medium underline">
              Submit deliver & finalize invoice
            </Link>{" "}
            on the PO page (posts stock and accounting together).
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      <ErpDocumentTabsLayout
        detailsLabel="Purchase details"
        entityId={billId}
        auditEntityType="purchase_bill"
        journalSourceType="purchase_bill"
      >
        <div className="space-y-4">
          <Card>
            <CardHeader className="border-b bg-muted/20 pb-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Purchase bill</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Vendor purchase document and line items
                  </p>
                </div>
                <div className="text-right text-sm">
                  <p className="text-muted-foreground">Bill #</p>
                  <p className="font-semibold tabular-nums" title={bill.purchase_bill_number}>
                    {formatErpDocRef("PB", billId)}
                  </p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-6 p-5 sm:p-6">
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                <MetaField icon={Building2} label="Vendor">
                  <Link
                    href={`/admin/vendors/${bill.vendor_id}/erp`}
                    className="text-primary hover:underline"
                  >
                    {bill.vendors?.name ?? "—"}
                  </Link>
                  {bill.vendors?.phone ? (
                    <p className="mt-0.5 text-xs font-normal text-muted-foreground">
                      {bill.vendors.phone}
                    </p>
                  ) : null}
                </MetaField>

                <MetaField icon={Store} label="Store">
                  {bill.stores?.name ?? "—"}
                </MetaField>

                <MetaField icon={Calendar} label="Bill date">
                  {formatDisplayDate(bill.purchase_date)}
                </MetaField>

                {bill.po_id ? (
                  <MetaField icon={FileText} label="Purchase order">
                    <Link
                      href={`/admin/purchase-orders/${bill.po_id}`}
                      className="text-primary hover:underline"
                      title={bill.purchase_orders?.po_number ?? undefined}
                    >
                      {formatErpDocRef("PO", bill.po_id)}
                    </Link>
                  </MetaField>
                ) : null}

                {bill.vendor_bill_number ? (
                  <MetaField icon={Hash} label="Vendor bill #">
                    {bill.vendor_bill_number}
                  </MetaField>
                ) : null}

                {bill.grn_reference ? (
                  <MetaField icon={Truck} label="GRN reference">
                    {bill.grn_reference}
                  </MetaField>
                ) : null}

                {bill.batch_reference ? (
                  <MetaField icon={Package} label="Batch reference">
                    {bill.batch_reference}
                  </MetaField>
                ) : null}

                {bill.reference ? (
                  <MetaField icon={FileText} label="Reference">
                    {bill.reference}
                  </MetaField>
                ) : null}

                {bill.vendors?.trn ? (
                  <MetaField icon={Receipt} label="Vendor TRN">
                    {bill.vendors.trn}
                  </MetaField>
                ) : null}
              </div>

              {bill.vendors?.address ? (
                <>
                  <Separator />
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Vendor address
                    </p>
                    <p className="mt-1 text-sm text-foreground">{bill.vendors.address}</p>
                  </div>
                </>
              ) : null}

              <Separator />

              <div>
                <h3 className="mb-3 text-sm font-semibold">Line items</h3>
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Rate</TableHead>
                        <TableHead className="text-right">Tax %</TableHead>
                        <TableHead className="text-right">Tax</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bill.erp_purchase_bill_lines.map((line, index) => (
                        <TableRow key={index}>
                          <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                          <TableCell className="font-medium">{line.product_name}</TableCell>
                          <TableCell className="text-right tabular-nums">{line.quantity}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCurrencyAmount(line.purchase_price)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {line.tax_rate_percent}%
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCurrencyAmount(line.tax_amount)}
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">
                            {formatCurrencyAmount(line.line_total)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {bill.erp_purchase_bill_landed_costs.length > 0 ? (
                <div>
                  <h3 className="mb-3 text-sm font-semibold">Landed costs</h3>
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Rate</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bill.erp_purchase_bill_landed_costs.map((lc, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{lc.name}</TableCell>
                            <TableCell className="text-right tabular-nums">{lc.quantity}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatCurrencyAmount(lc.rate)}
                            </TableCell>
                            <TableCell className="text-right font-semibold tabular-nums">
                              {formatCurrencyAmount(lc.line_total)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : null}

              <div className="flex justify-end">
                <div className="w-full max-w-xs space-y-2 rounded-lg border bg-muted/20 p-4">
                  <TotalsRow label="Subtotal" value={formatCurrencyAmount(bill.subtotal)} />
                  <TotalsRow label="Tax" value={formatCurrencyAmount(bill.tax_amount)} />
                  {bill.discount > 0 ? (
                    <TotalsRow label="Discount" value={formatCurrencyAmount(bill.discount)} />
                  ) : null}
                  {bill.landed_cost_total > 0 ? (
                    <TotalsRow
                      label="Landed costs"
                      value={formatCurrencyAmount(bill.landed_cost_total)}
                    />
                  ) : null}
                  <Separator />
                  <TotalsRow
                    label="Grand total"
                    value={formatCurrencyAmount(bill.total_amount)}
                    emphasis
                  />
                  <TotalsRow label="Paid" value={formatCurrencyAmount(bill.amount_paid)} />
                  <TotalsRow
                    label="Balance due"
                    value={formatCurrencyAmount(bill.balance_due)}
                    emphasis
                    danger={bill.balance_due > 0}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b bg-muted/20 pb-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Payments</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Supplier payments applied to this bill
                  </p>
                </div>
                {canPay ? (
                  <Button
                    nativeButton={false}
                    size="sm"
                    variant="outline"
                    render={
                      <Link href={`/admin/erp/supplier-payments/new?billId=${billId}`} />
                    }
                  >
                    <CreditCard data-icon="inline-start" />
                    Record payment
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {bill.erp_supplier_payment_allocations.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
                  <div className="flex size-11 items-center justify-center rounded-full bg-muted">
                    <Wallet className="size-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium">No payments recorded</p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    {canPay
                      ? "Record a supplier payment to clear the outstanding balance on this bill."
                      : "This bill has no supplier payments yet."}
                  </p>
                  {canPay ? (
                    <Button
                      nativeButton={false}
                      size="sm"
                      className="mt-2"
                      render={
                        <Link href={`/admin/erp/supplier-payments/new?billId=${billId}`} />
                      }
                    >
                      Add payment
                    </Button>
                  ) : null}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Payment #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Allocated</TableHead>
                        <TableHead className="text-right">Payment total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bill.erp_supplier_payment_allocations.map((allocation, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            {allocation.erp_supplier_payments?.id ? (
                              <Link
                                href={`/admin/erp/supplier-payments/${allocation.erp_supplier_payments.id}`}
                                className="font-medium text-primary hover:underline"
                              >
                                {allocation.erp_supplier_payments.payment_number}
                              </Link>
                            ) : (
                              allocation.erp_supplier_payments?.payment_number ?? "—"
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDisplayDate(allocation.erp_supplier_payments?.payment_date)}
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">
                            {formatCurrencyAmount(allocation.amount)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {formatCurrencyAmount(
                              allocation.erp_supplier_payments?.total_amount ?? 0,
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {bill.notes?.trim() ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {bill.notes.trim()}
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </ErpDocumentTabsLayout>
    </AdminPageLayout>
  );
}
