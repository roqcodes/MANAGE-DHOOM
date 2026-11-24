"use client";

import { useEffect, useState, useTransition } from "react";
import { format } from "date-fns";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  FileText,
  Mail,
  Pencil,
  Phone,
  Plus,
  HandCoins,
  Scale,
  ShieldCheck,
  Trash2,
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
  AdminPrimaryAction,
  AdminSecondaryIconAction,
  ErpPartyDetailMetricGrid,
  ErpPartyDetailPageGrid,
  ErpPartyDetailTabs,
  ErpPartyFinancialAsideCard,
  ErpPartyProfileInlineAdmin,
  ErpPartyProfileHeaderCard,
  ErpPartyProfileToolbar,
  ErpPartySummaryMetricCard,
} from "@/modules/admin/ui";
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
import { adminDelete, adminGet } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import { useAdminAlert } from "@/modules/admin/components/admin-alert-provider";
import { useAdminAction } from "@/modules/admin/hooks/use-admin-action";
import { invalidateAdminCustomerCatalogQueries } from "@/modules/erp/lib/entity-live-search.client";
import { AdminTableBodySkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { StatusBadge } from "@/modules/admin/components/status-badge";
import { salesInvoiceStatusForBadge } from "@/common/erp/document-status";
import { ActivityLogPanel } from "@/modules/erp/components/activity-log-panel";
import {
  blockUserAction,
  unblockUserAction,
} from "@/modules/users/actions/users.actions";
import { formatCurrencyAmount } from "@/lib/format-currency";
import type { CustomerDetailsResponse } from "@/modules/customers/services/customers.service";
import {
  CustomerAvatar,
  formatCreditLimit,
  formatCustomerId,
} from "@/modules/customers/components/customers-ui";
import { ErpSettlementFormView } from "@/modules/admin/views/erp/erp-settlement-form-view";
import { CustomerStatementActions } from "@/modules/customers/components/customer-statement-actions";

type ErpPayload = {
  summary: CustomerErpSummary;
  statement: CustomerStatementLine[];
  invoices: CustomerInvoiceRow[];
};

export function CustomerDetailPanel({
  details,
  orders,
}: {
  details: CustomerDetailsResponse;
  orders: Order[];
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { runAction, isPending: deletePending } = useAdminAction();
  const { confirm } = useAdminAlert();
  const [isPending, startTransition] = useTransition();
  const [tab, setTab] = useState<"statement" | "sales" | "activity">("statement");
  const [erp, setErp] = useState<ErpPayload | null>(null);
  const [erpLoading, setErpLoading] = useState(true);
  const [settlementOpen, setSettlementOpen] = useState(false);
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
  const canSettleAccount = !erpLoading && (financial?.balanceDue ?? 0) > 0;

  const statementRows = erp?.statement ?? [];

  function handleToggleBlock() {
    startTransition(async () => {
      if (verified) await blockUserAction(summary.id);
      else await unblockUserAction(summary.id);
      await queryClient.invalidateQueries({
        queryKey: adminQueryKeys.customerDetail(summary.id),
      });
      await queryClient.invalidateQueries({ queryKey: ["admin", "customers"] });
    });
  }

  const customerAdminActions = (
    <>
      <AdminSecondaryIconAction
        nativeButton={false}
        render={<Link href={`/admin/customers?form=edit&id=${summary.id}`} />}
        aria-label="Edit customer"
        title="Edit customer"
      >
        <Pencil />
      </AdminSecondaryIconAction>
      <AdminSecondaryIconAction
        disabled={isPending}
        onClick={handleToggleBlock}
        aria-label={verified ? "Block customer" : "Unblock customer"}
        title={verified ? "Block customer" : "Unblock customer"}
      >
        {verified ? <Ban /> : <ShieldCheck />}
      </AdminSecondaryIconAction>
      <AdminSecondaryIconAction
        className="text-destructive hover:text-destructive"
        disabled={deletePending}
        onClick={handleDelete}
        aria-label="Delete customer"
        title="Delete customer"
      >
        <Trash2 />
      </AdminSecondaryIconAction>
    </>
  );

  async function handleDelete() {
    const ok = await confirm({
      title: "Delete customer?",
      message: `Delete "${displayName}"? Only customers with no invoices, orders, payments, or other operational records can be removed. This cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    runAction(
      async () => {
        await adminDelete(`customers/${summary.id}`);
        await invalidateAdminCustomerCatalogQueries(queryClient);
        router.push("/admin/customers");
      },
      { errorTitle: "Couldn't delete customer" },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {settlementOpen ? (
        <ErpSettlementFormView
          side="customer"
          variant="modal"
          open={settlementOpen}
          onOpenChange={setSettlementOpen}
          initialPartyId={summary.id}
          initialPartyLabel={displayName}
          onSuccess={() => {
            setSettlementOpen(false);
            setErpLoading(true);
            adminGet<ErpPayload>(`customers/${summary.id}/erp`)
              .then(setErp)
              .finally(() => setErpLoading(false));
          }}
        />
      ) : null}

      <ErpPartyProfileHeaderCard
        identity={
          <div className="flex min-w-0 gap-3 sm:gap-4">
            <CustomerAvatar
              name={displayName}
              avatarUrl={summary.avatar_url}
              size="lg"
              className="shrink-0"
              enableHoverPreview={false}
            />
            <div className="flex min-w-0 flex-1 items-start gap-2 sm:block sm:gap-0">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {verified ? (
                    <Badge
                      variant="outline"
                      className="border-emerald-200 bg-emerald-50 text-emerald-700"
                    >
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
                <h1 className="mt-2 text-lg font-semibold leading-tight sm:text-2xl">
                  {displayName}
                </h1>
                {summary.company_name && summary.company_name !== displayName ? (
                  <p className="mt-1 text-sm text-muted-foreground">{summary.company_name}</p>
                ) : null}
                <div className="mt-2 flex flex-col gap-1.5 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-1">
                  {summary.email ? (
                    <span className="inline-flex min-w-0 items-center gap-1.5 break-all">
                      <Mail className="size-3.5 shrink-0" aria-hidden />
                      {summary.email}
                    </span>
                  ) : null}
                  {summary.phone ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Phone className="size-3.5 shrink-0" aria-hidden />
                      {summary.phone}
                    </span>
                  ) : null}
                  {summary.location ? <span>{summary.location}</span> : null}
                </div>
              </div>
              <ErpPartyProfileInlineAdmin>{customerAdminActions}</ErpPartyProfileInlineAdmin>
            </div>
          </div>
        }
        actions={
          <div className="flex w-full flex-col gap-2.5 sm:items-end">
            <ErpPartyProfileToolbar adminActions={customerAdminActions}>
              <AdminPrimaryAction
                nativeButton={false}
                render={
                  <Link href={`/admin/erp/invoices?form=new&customerId=${summary.id}`} />
                }
              >
                <Plus data-icon="inline-start" />
                New invoice
              </AdminPrimaryAction>
              <Button
                variant="outline"
                size="page"
                className="rounded-full"
                nativeButton={false}
                render={
                  <Link href={`/admin/erp/payments/new?customerId=${summary.id}`} />
                }
              >
                <HandCoins data-icon="inline-start" />
                Record payment
              </Button>
              {canSettleAccount ? (
                <Button
                  variant="outline"
                  size="page"
                  className="col-span-2 rounded-full sm:col-span-1"
                  type="button"
                  onClick={() => setSettlementOpen(true)}
                >
                  <Scale data-icon="inline-start" />
                  Settle account
                </Button>
              ) : null}
            </ErpPartyProfileToolbar>
            <CustomerStatementActions
              customerId={summary.id}
              customerName={displayName}
              phone={summary.phone}
              customerSearch={summary.phone?.trim() || displayName}
              disabled={erpLoading}
            />
          </div>
        }
      />

      <ErpPartyDetailPageGrid
        aside={
          <ErpPartyFinancialAsideCard>
            <CardHeader className="pb-2">
              <CardTitle className="text-base sm:text-lg">Financial summary</CardTitle>
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
              <div className="flex justify-between gap-3 border-t pt-3 text-base font-semibold">
                <span>Balance due</span>
                <span className="text-primary tabular-nums">
                  {erpLoading ? "…" : formatCurrencyAmount(financial?.balanceDue ?? 0)}
                </span>
              </div>
            </CardContent>
          </ErpPartyFinancialAsideCard>
        }
        main={
          <>
            <ErpPartyDetailMetricGrid>
              <ErpPartySummaryMetricCard
                label="Outstanding receivables"
                value={
                  erpLoading ? "…" : formatCurrencyAmount(financial?.receivables ?? 0)
                }
                tone="primary"
              />
              <ErpPartySummaryMetricCard
                label="Unallocated payments"
                value={
                  erpLoading
                    ? "…"
                    : formatCurrencyAmount(financial?.unallocatedPayments ?? 0)
                }
                tone={financial?.unallocatedPayments ? "primary" : "muted"}
              />
              <ErpPartySummaryMetricCard
                label="Credit limit"
                value={
                  erpLoading ? "…" : formatCreditLimit(financial?.creditLimit ?? null)
                }
                tone="muted"
              />
              <ErpPartySummaryMetricCard
                label="Opening balance"
                value={
                  erpLoading ? "…" : formatCurrencyAmount(financial?.openingBalance ?? 0)
                }
              />
            </ErpPartyDetailMetricGrid>

            <ErpPartyDetailTabs
              active={tab}
              onChange={(key) => setTab(key as typeof tab)}
              tabs={[
                { id: "statement", label: "Statement" },
                { id: "sales", label: "Sales" },
                { id: "activity", label: "Activity" },
              ]}
            />

          {tab === "statement" ? (
            <Card className="border border-border ring-0">
              <CardHeader className="border-b border-border">
                <CardTitle>Statement of accounts</CardTitle>
                <CardDescription>
                  Chronological invoices, payments, and credits with running balance.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {erpLoading ? (
                  <AdminTableBodySkeleton rows={6} />
                ) : statementRows.length === 0 ? (
                  <p className="p-8 text-center text-sm text-muted-foreground">
                    No statement entries yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead className="hidden md:table-cell">Store</TableHead>
                          <TableHead>Transaction</TableHead>
                          <TableHead className="hidden lg:table-cell">Details</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="hidden text-right sm:table-cell">Payments</TableHead>
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
                            <TableCell className="max-w-[8rem] truncate text-sm font-medium capitalize sm:max-w-none">
                              {line.transactionType.replace(/_/g, " ")}
                            </TableCell>
                            <TableCell className="hidden max-w-[200px] truncate text-sm lg:table-cell">
                              {line.details}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums">
                              {line.amount > 0 ? formatCurrencyAmount(line.amount) : "—"}
                            </TableCell>
                            <TableCell className="hidden text-right text-sm tabular-nums sm:table-cell">
                              {line.payments > 0 ? formatCurrencyAmount(line.payments) : "—"}
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium tabular-nums">
                              {formatCurrencyAmount(line.balance)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
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
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Number</TableHead>
                          <TableHead className="hidden sm:table-cell">Due date</TableHead>
                          <TableHead className="text-right">Net total</TableHead>
                          <TableHead className="hidden text-right md:table-cell">Paid</TableHead>
                          <TableHead className="text-right">Balance</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {erp.invoices.map((inv) => (
                          <TableRow key={inv.id}>
                            <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
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
                            <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                              {inv.dueDate ?? "—"}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums">
                              {formatCurrencyAmount(inv.totalAmount)}
                            </TableCell>
                            <TableCell className="hidden text-right text-sm tabular-nums md:table-cell">
                              {formatCurrencyAmount(inv.amountPaid)}
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium tabular-nums">
                              {formatCurrencyAmount(inv.balanceDue)}
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={salesInvoiceStatusForBadge(inv.status)} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
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
          </>
        }
      />

      {orders.length > 0 ? (
        <Card className="border border-border ring-0">
          <CardHeader className="border-b border-border">
            <CardTitle>Recent orders</CardTitle>
            <CardDescription>Storefront and POS orders from this customer.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead className="hidden sm:table-cell">Date</TableHead>
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
                    <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
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
