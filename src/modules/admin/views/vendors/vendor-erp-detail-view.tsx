"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  BadgePercent,
  Building2,
  FileText,
  HandCoins,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Trash2,
} from "lucide-react";

import type {
  ErpPurchaseBillListRow,
  VendorErpProfile,
  VendorErpSummary,
  VendorStatementLine,
} from "@/common/erp/purchasing-types";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { AdminBreadcrumb } from "@/modules/admin/components/admin-breadcrumb";
import {
  AdminDetailBodySkeleton,
  AdminTableBodySkeleton,
} from "@/modules/admin/components/admin-page-skeleton";
import { StatusBadge } from "@/modules/admin/components/status-badge";
import { adminDelete, adminGet } from "@/modules/admin/lib/admin-api-client";
import { useAdminAlert } from "@/modules/admin/components/admin-alert-provider";
import { useAdminAction } from "@/modules/admin/hooks/use-admin-action";
import { AdminPageLayout, AdminTableDateTime } from "@/modules/admin/ui";
import { ActivityLogPanel } from "@/modules/erp/components/activity-log-panel";
import { ErpSettlementFormView } from "@/modules/admin/views/erp/erp-settlement-form-view";
import { ErpCommercialDiscountFormView } from "@/modules/admin/views/erp/erp-commercial-discount-form-view";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { cn } from "@/lib/utils";

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

export function VendorErpDetailView() {
  const params = useParams();
  const router = useRouter();
  const { runAction, isPending: deletePending } = useAdminAction();
  const { confirm } = useAdminAlert();
  const id = params.id as string;

  const [profile, setProfile] = useState<VendorErpProfile | null>(null);
  const [summary, setSummary] = useState<VendorErpSummary | null>(null);
  const [statement, setStatement] = useState<VendorStatementLine[]>([]);
  const [purchases, setPurchases] = useState<ErpPurchaseBillListRow[]>([]);
  const [tab, setTab] = useState<"statement" | "purchases" | "activity">("statement");
  const [loading, setLoading] = useState(true);
  const [settlementOpen, setSettlementOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);

  const loadErpData = useCallback(async () => {
    const bundle = await adminGet<{
      profile: VendorErpProfile;
      summary: VendorErpSummary;
      statement: { lines: VendorStatementLine[] };
      purchases: { data: ErpPurchaseBillListRow[] };
    }>(`vendors/${id}/erp?view=detail`);
    setProfile(bundle.profile);
    setSummary(bundle.summary);
    setStatement(bundle.statement.lines);
    setPurchases(bundle.purchases.data);
  }, [id]);

  useEffect(() => {
    setLoading(true);
    loadErpData().finally(() => setLoading(false));
  }, [loadErpData]);

  const displayName = profile?.name?.trim() || "Vendor";
  const isActive = profile?.is_active !== false;

  const statementRows = statement;

  async function handleDelete() {
    const ok = await confirm({
      title: "Delete vendor?",
      message: `Delete "${displayName}"? Only vendors with no bills, payments, or other operational records can be removed. Catalog SKUs on this vendor are also removed. This cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    runAction(
      async () => {
        await adminDelete(`vendors/${id}`);
        router.push("/admin/vendors");
      },
      { errorTitle: "Couldn't delete vendor" },
    );
  }

  function refreshAfterFinancialAction() {
    setLoading(true);
    loadErpData().finally(() => setLoading(false));
  }

  if (loading && !profile) {
    return (
      <AdminPageLayout>
        <AdminBreadcrumb
          backHref="/admin/vendors"
          items={[
            { label: "Vendors", href: "/admin/vendors" },
            { label: "…" },
          ]}
        />
        <AdminDetailBodySkeleton />
      </AdminPageLayout>
    );
  }

  if (!profile || !summary) {
    return (
      <AdminPageLayout>
        <AdminBreadcrumb
          backHref="/admin/vendors"
          items={[
            { label: "Vendors", href: "/admin/vendors" },
            { label: "Vendor" },
          ]}
        />
        <p className="text-sm text-muted-foreground">Vendor not found.</p>
      </AdminPageLayout>
    );
  }

  const balanceDue = summary.balanceDue ?? 0;

  return (
    <AdminPageLayout>
      <AdminBreadcrumb
        backHref="/admin/vendors"
        items={[
          { label: "Vendors", href: "/admin/vendors" },
          { label: displayName },
        ]}
      />

      {settlementOpen ? (
        <ErpSettlementFormView
          side="supplier"
          variant="modal"
          open={settlementOpen}
          onOpenChange={setSettlementOpen}
          initialPartyId={id}
          initialPartyLabel={displayName}
          onSuccess={() => {
            setSettlementOpen(false);
            refreshAfterFinancialAction();
          }}
        />
      ) : null}

      {discountOpen ? (
        <ErpCommercialDiscountFormView
          side="supplier"
          variant="modal"
          open={discountOpen}
          onOpenChange={setDiscountOpen}
          initialPartyId={id}
          initialPartyLabel={displayName}
          lockParty
          onSuccess={() => {
            setDiscountOpen(false);
            refreshAfterFinancialAction();
          }}
        />
      ) : null}

      <Card className="border border-border ring-0">
        <CardContent className="flex flex-col gap-4 py-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 flex-1 gap-4">
            <div
              className="flex size-16 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground"
              aria-hidden
            >
              <Building2 className="size-8" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {isActive ? (
                  <Badge
                    variant="outline"
                    className="border-emerald-200 bg-emerald-50 text-emerald-700"
                  >
                    Active
                  </Badge>
                ) : (
                  <Badge variant="secondary">Inactive</Badge>
                )}
                {profile.vendor_type ? (
                  <Badge variant="outline">{profile.vendor_type}</Badge>
                ) : null}
                {profile.trn ? (
                  <span className="font-mono text-xs text-muted-foreground">
                    TRN {profile.trn}
                  </span>
                ) : null}
              </div>
              <h1 className="mt-2 text-2xl font-semibold">{displayName}</h1>
              {profile.address ? (
                <p className="mt-2 flex items-start gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {profile.address}
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {profile.email ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="size-3.5" aria-hidden />
                    {profile.email}
                  </span>
                ) : null}
                {profile.phone ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="size-3.5" aria-hidden />
                    {profile.phone}
                  </span>
                ) : null}
                {profile.po_box ? <span>PO Box {profile.po_box}</span> : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Button
              size="sm"
              nativeButton={false}
              render={
                <Link href={`/admin/erp/purchase-bills?form=new&vendorId=${id}`} />
              }
            >
              <Plus data-icon="inline-start" />
              New bill
            </Button>
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={
                <Link href={`/admin/erp/supplier-payments/new?vendorId=${id}`} />
              }
            >
              Record payment
            </Button>
            <Button size="sm" variant="outline" type="button" onClick={() => setDiscountOpen(true)}>
              <BadgePercent data-icon="inline-start" />
              Record discount
            </Button>
            <Button
              size="sm"
              variant="outline"
              type="button"
              disabled={balanceDue <= 0}
              onClick={() => setSettlementOpen(true)}
            >
              <HandCoins data-icon="inline-start" />
              Settle account
            </Button>
            <Link
              href={`/admin/vendors/${id}/edit`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Pencil data-icon="inline-start" />
              Edit
            </Link>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={deletePending}
              onClick={handleDelete}
            >
              <Trash2 data-icon="inline-start" />
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryMetricCard
              label="Outstanding payables"
              value={loading ? "…" : formatCurrencyAmount(summary.payables ?? balanceDue)}
              tone="primary"
            />
            <SummaryMetricCard
              label="Unapplied credits"
              value={loading ? "…" : formatCurrencyAmount(summary.creditBalance ?? 0)}
              tone={summary.creditBalance > 0 ? "primary" : "muted"}
            />
            <SummaryMetricCard
              label="Total purchases"
              value={loading ? "…" : formatCurrencyAmount(summary.billTotal ?? 0)}
            />
            <SummaryMetricCard
              label="Opening balance"
              value={loading ? "…" : formatCurrencyAmount(summary.openingBalance ?? 0)}
              tone="muted"
            />
          </div>

          <div className="flex gap-1 border-b">
            {(
              [
                ["statement", "Statement"],
                ["purchases", "Purchases"],
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
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle>Statement of accounts</CardTitle>
                    <CardDescription>Bills, payments, and credits with running balance.</CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={loading || balanceDue <= 0}
                    onClick={() => setSettlementOpen(true)}
                  >
                    <HandCoins data-icon="inline-start" />
                    Settle account
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
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
                          <TableCell className="hidden max-w-[220px] truncate text-sm lg:table-cell">
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

          {tab === "purchases" ? (
            <Card className="border border-border ring-0">
              <CardHeader className="border-b border-border">
                <CardTitle>Purchase bills</CardTitle>
                <CardDescription>Posted and open bills from this vendor.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <AdminTableBodySkeleton rows={6} />
                ) : purchases.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                    <FileText className="size-10 text-muted-foreground/40" aria-hidden />
                    <p className="text-sm text-muted-foreground">No purchase bills yet.</p>
                    <Button
                      size="sm"
                      nativeButton={false}
                      render={
                        <Link href={`/admin/erp/purchase-bills?form=new&vendorId=${id}`} />
                      }
                    >
                      <Plus data-icon="inline-start" />
                      Create bill
                    </Button>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Bill #</TableHead>
                        <TableHead className="hidden sm:table-cell">Store</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {purchases.map((bill) => (
                        <TableRow key={bill.id}>
                          <TableCell className="text-sm text-muted-foreground">
                            <AdminTableDateTime documentDate={bill.purchase_date} activity={bill} />
                          </TableCell>
                          <TableCell>
                            <Link
                              href={`/admin/erp/purchase-bills/${bill.id}`}
                              className="text-sm font-medium hover:text-primary hover:underline"
                            >
                              {bill.purchase_bill_number}
                            </Link>
                          </TableCell>
                          <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                            {bill.store_name ?? "—"}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {formatCurrencyAmount(bill.total_amount)}
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium tabular-nums">
                            {formatCurrencyAmount(bill.balance_due)}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={bill.display_status} />
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
                <CardDescription>Changes and actions recorded for this vendor.</CardDescription>
              </CardHeader>
              <CardContent>
                <ActivityLogPanel entityType="vendor" entityId={id} />
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
                {loading ? "…" : formatCurrencyAmount(summary.openingBalance ?? 0)}
              </span>
            </div>
            {summary.openingBalanceDate ? (
              <div className="flex justify-between gap-3 text-xs text-muted-foreground">
                <span>As of</span>
                <span>{summary.openingBalanceDate}</span>
              </div>
            ) : null}
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Bill total</span>
              <span className="tabular-nums">
                {loading ? "…" : formatCurrencyAmount(summary.billTotal ?? 0)}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Payments made</span>
              <span className="tabular-nums">
                {loading ? "…" : formatCurrencyAmount(summary.paymentMade ?? 0)}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Vendor credits</span>
              <span className="tabular-nums">
                {loading ? "…" : formatCurrencyAmount(summary.creditTotal ?? 0)}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Unapplied credits</span>
              <span className="tabular-nums">
                {loading ? "…" : formatCurrencyAmount(summary.creditBalance ?? 0)}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Refunds</span>
              <span className="tabular-nums">
                {loading ? "…" : formatCurrencyAmount(summary.refundTotal ?? 0)}
              </span>
            </div>
            <div className="flex justify-between gap-3 border-t pt-3 font-semibold">
              <span>Balance due</span>
              <span className="text-primary tabular-nums">
                {loading ? "…" : formatCurrencyAmount(balanceDue)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        <Link href={`/admin/vendors/${id}`} className="hover:text-primary hover:underline">
          Catalog & supply lines
        </Link>
        {" · "}
        Manage variants and stock linked to this vendor.
      </p>
    </AdminPageLayout>
  );
}
