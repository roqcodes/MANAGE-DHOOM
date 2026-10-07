"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { format } from "date-fns";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  FileText,
  Mail,
  Pencil,
  Phone,
  Plus,
  ShieldCheck,
} from "lucide-react";

import type { Order } from "@/common/admin/types";
import type {
  CustomerErpSummary,
  CustomerInvoiceRow,
  CustomerStatementLine,
} from "@/common/erp/sales-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import { AdminTableBodySkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { StatusBadge } from "@/modules/admin/components/status-badge";
import { ActivityLogPanel } from "@/modules/erp/components/activity-log-panel";
import {
  blockUserAction,
  unblockUserAction,
} from "@/modules/users/actions/users.actions";
import { formatCurrencyAmount } from "@/lib/format-currency";
import type { CustomerDetailsResponse } from "@/modules/customers/services/customers.service";
import {
  formatCreditLimit,
  formatCustomerId,
} from "@/modules/customers/components/customers-ui";
import { cn } from "@/lib/utils";

type ErpPayload = {
  summary: CustomerErpSummary;
  statement: CustomerStatementLine[];
  invoices: CustomerInvoiceRow[];
};

function SummaryMetricCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "primary" | "muted";
}) {
  return (
    <Card size="sm" className="border border-border ring-0">
      <CardContent className="flex flex-col gap-1 pt-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p
          className={cn(
            "text-2xl font-semibold tabular-nums tracking-tight",
            tone === "primary" && "text-primary",
            tone === "muted" && "text-muted-foreground",
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

export function CustomerDetailPanel({
  details,
  orders,
}: {
  details: CustomerDetailsResponse;
  txPage: number;
  orders: Order[];
}) {
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [tab, setTab] = useState<"statement" | "sales" | "activity">("statement");
  const [erp, setErp] = useState<ErpPayload | null>(null);
  const [erpLoading, setErpLoading] = useState(true);
  const { summary } = details;
  const verified = summary.is_verified !== false;

  useEffect(() => {
    adminGet<ErpPayload>(`customers/${summary.id}/erp`)
      .then(setErp)
      .finally(() => setErpLoading(false));
  }, [summary.id]);

  const displayName =
    summary.contact_display_name?.trim() ||
    summary.company_name?.trim() ||
    summary.name?.trim() ||
    "Unknown customer";

  const financial = erp?.summary;

  const statementRows = useMemo(() => {
    if (!erp?.statement.length) return [];
    return [...erp.statement].reverse();
  }, [erp?.statement]);

  function handleToggleBlock() {
    startTransition(async () => {
      if (verified) await blockUserAction(summary.id);
      else await unblockUserAction(summary.id);
      await queryClient.invalidateQueries({
        queryKey: adminQueryKeys.customerDetail(summary.id, 0),
      });
      await queryClient.invalidateQueries({ queryKey: ["admin", "customers"] });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="border border-border ring-0">
        <CardContent className="flex flex-col gap-4 py-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {verified ? (
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                  Active
                </Badge>
              ) : (
                <Badge variant="destructive">Blocked</Badge>
              )}
              <span className="font-mono text-xs text-muted-foreground">
                {formatCustomerId({
                  id: summary.id,
                  customer_number: summary.customer_number,
                  name: summary.name,
                  email: summary.email,
                  phone: summary.phone,
                  role: summary.role,
                  is_verified: summary.is_verified,
                  created_at: summary.created_at,
                })}
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold">{displayName}</h1>
            {summary.company_name && summary.company_name !== displayName ? (
              <p className="mt-1 text-sm text-muted-foreground">{summary.company_name}</p>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {summary.email ? (
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="size-3.5" aria-hidden />
                  {summary.email}
                </span>
              ) : null}
              {summary.phone ? (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="size-3.5" aria-hidden />
                  {summary.phone}
                </span>
              ) : null}
              {summary.location ? <span>{summary.location}</span> : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              nativeButton={false}
              render={
                <Link href={`/admin/erp/invoices?form=new&customerId=${summary.id}`} />
              }
            >
              <Plus data-icon="inline-start" />
              New invoice
            </Button>
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={
                <Link href={`/admin/erp/payments/new?customerId=${summary.id}&advance=1`} />
              }
            >
              Record advance payment
            </Button>
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={
                <Link href={`/admin/erp/payments/new?customerId=${summary.id}`} />
              }
            >
              Apply payment
            </Button>
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<Link href={`/admin/customers?form=edit&id=${summary.id}`} />}
            >
              <Pencil data-icon="inline-start" />
              Edit
            </Button>
            <Button variant="outline" size="sm" disabled={isPending} onClick={handleToggleBlock}>
              {verified ? (
                <>
                  <Ban data-icon="inline-start" />
                  Block
                </>
              ) : (
                <>
                  <ShieldCheck data-icon="inline-start" />
                  Unblock
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryMetricCard
              label="Outstanding receivables"
              value={
                erpLoading
                  ? "…"
                  : formatCurrencyAmount(financial?.receivables ?? 0)
              }
              tone="primary"
            />
            <SummaryMetricCard
              label="Unallocated payments"
              value={
                erpLoading
                  ? "…"
                  : formatCurrencyAmount(financial?.unallocatedPayments ?? 0)
              }
              tone={financial?.unallocatedPayments ? "primary" : "muted"}
            />
            <SummaryMetricCard
              label="Credit limit"
              value={
                erpLoading
                  ? "…"
                  : formatCreditLimit(financial?.creditLimit ?? null)
              }
              tone="muted"
            />
            <SummaryMetricCard
              label="Opening balance"
              value={
                erpLoading
                  ? "…"
                  : formatCurrencyAmount(financial?.openingBalance ?? 0)
              }
            />
          </div>

          <div className="flex gap-1 border-b">
            {(
              [
                ["statement", "Statement"],
                ["sales", "Sales"],
                ["activity", "Activity"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  tab === key
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "statement" ? (
            <Card className="border border-border ring-0">
              <CardHeader className="border-b border-border">
                <CardTitle>Statement of accounts</CardTitle>
                <CardDescription>Invoices and payments with running balance.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {erpLoading ? (
                  <AdminTableBodySkeleton rows={6} />
                ) : statementRows.length === 0 ? (
                  <p className="p-8 text-center text-sm text-muted-foreground">
                    No statement entries yet.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead className="hidden md:table-cell">Store</TableHead>
                        <TableHead>Transaction</TableHead>
                        <TableHead className="hidden lg:table-cell">Details</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Payments</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {statementRows.map((line, index) => (
                        <TableRow key={`${line.date}-${line.details}-${index}`}>
                          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                            {line.date}
                          </TableCell>
                          <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                            {line.storeName ?? "—"}
                          </TableCell>
                          <TableCell className="text-sm font-medium capitalize">
                            {line.transactionType.replace(/_/g, " ")}
                          </TableCell>
                          <TableCell className="hidden max-w-[200px] truncate text-sm lg:table-cell">
                            {line.details}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {line.amount > 0 ? formatCurrencyAmount(line.amount) : "—"}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {line.payments > 0 ? formatCurrencyAmount(line.payments) : "—"}
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium tabular-nums">
                            {formatCurrencyAmount(line.balance)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          ) : null}

          {tab === "sales" ? (
            <Card className="border border-border ring-0">
              <CardHeader className="border-b border-border">
                <CardTitle>Sales</CardTitle>
                <CardDescription>Invoices issued to this customer.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {erpLoading ? (
                  <AdminTableBodySkeleton rows={6} />
                ) : !erp?.invoices.length ? (
                  <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                    <FileText className="size-10 text-muted-foreground/40" aria-hidden />
                    <p className="text-sm text-muted-foreground">No invoices yet.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Number</TableHead>
                        <TableHead>Due date</TableHead>
                        <TableHead className="text-right">Net total</TableHead>
                        <TableHead className="text-right">Paid</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {erp.invoices.map((inv) => (
                        <TableRow key={inv.id}>
                          <TableCell className="text-sm text-muted-foreground">
                            {inv.createdAt
                              ? format(new Date(inv.createdAt), "MMM d, yyyy")
                              : "—"}
                          </TableCell>
                          <TableCell>
                            <Link
                              href={`/admin/erp/invoices/${inv.id}`}
                              className="text-sm font-medium hover:text-primary hover:underline"
                            >
                              {inv.invoiceNumber}
                            </Link>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {inv.dueDate ?? "—"}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {formatCurrencyAmount(inv.totalAmount)}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {formatCurrencyAmount(inv.amountPaid)}
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium tabular-nums">
                            {formatCurrencyAmount(inv.balanceDue)}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={inv.status} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          ) : null}

          {tab === "activity" ? (
            <Card className="border border-border ring-0">
              <CardHeader>
                <CardTitle>Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <ActivityLogPanel entityType="customer" entityId={summary.id} />
              </CardContent>
            </Card>
          ) : null}
        </div>

        <Card className="h-fit border border-border ring-0">
          <CardHeader>
            <CardTitle>Financial summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Opening balance</span>
              <span className="tabular-nums">
                {erpLoading ? "…" : formatCurrencyAmount(financial?.openingBalance ?? 0)}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">
                Invoice total
                {financial?.invoiceCount ? ` (${financial.invoiceCount})` : ""}
              </span>
              <span className="tabular-nums">
                {erpLoading ? "…" : formatCurrencyAmount(financial?.invoiceTotal ?? 0)}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">
                Credit notes
                {financial?.creditNoteCount ? ` (${financial.creditNoteCount})` : ""}
              </span>
              <span className="tabular-nums">
                {erpLoading ? "…" : formatCurrencyAmount(financial?.creditNoteTotal ?? 0)}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Payment received</span>
              <span className="tabular-nums">
                {erpLoading ? "…" : formatCurrencyAmount(financial?.paymentReceived ?? 0)}
              </span>
            </div>
            <div className="flex justify-between gap-3 border-t pt-3 font-semibold">
              <span>Balance due</span>
              <span className="text-primary tabular-nums">
                {erpLoading ? "…" : formatCurrencyAmount(financial?.balanceDue ?? 0)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {orders.length > 0 ? (
        <Card className="border border-border ring-0">
          <CardHeader className="border-b border-border">
            <CardTitle>Recent orders</CardTitle>
            <CardDescription>Storefront and POS orders from this customer.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="text-sm font-medium hover:text-primary hover:underline"
                      >
                        #{order.id.split("-")[0]?.toUpperCase() ?? order.id.slice(0, 8)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {order.created_at
                        ? format(new Date(order.created_at), "MMM d, yyyy")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={order.status} />
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold tabular-nums">
                      {formatCurrencyAmount(Number(order.total_amount ?? 0))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
