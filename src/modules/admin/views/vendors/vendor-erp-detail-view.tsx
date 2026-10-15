"use client";

import { useEffect, useState } from "react";
import { HandCoins, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import type {
  ErpPurchaseBillListRow,
  VendorErpProfile,
  VendorErpSummary,
  VendorStatementLine,
} from "@/common/erp/purchasing-types";
import type { AuditLogEntry } from "@/common/erp/types";
import { AdminDetailSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { adminDelete, adminGet } from "@/modules/admin/lib/admin-api-client";
import { useAdminAlert } from "@/modules/admin/components/admin-alert-provider";
import { useAdminAction } from "@/modules/admin/hooks/use-admin-action";
import { formatAuditLogUserDetail } from "@/modules/erp/lib/audit-log-display";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { AdminPageHeader, AdminPageLayout, AdminTableDateTime } from "@/modules/admin/ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErpSettlementFormView } from "@/modules/admin/views/erp/erp-settlement-form-view";

type AuditLog = AuditLogEntry;

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
  const [activity, setActivity] = useState<AuditLog[]>([]);
  const [tab, setTab] = useState<"statement" | "purchases" | "activity">("statement");
  const [loading, setLoading] = useState(true);
  const [settlementOpen, setSettlementOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      adminGet<VendorErpProfile>(`vendors/${id}/erp?view=profile`),
      adminGet<VendorErpSummary>(`vendors/${id}/erp`),
      adminGet<{ lines: VendorStatementLine[] }>(`vendors/${id}/erp?view=statement`),
      adminGet<{ data: ErpPurchaseBillListRow[] }>(`vendors/${id}/erp?view=purchases`),
      adminGet<{ logs: AuditLog[] }>(`vendors/${id}/erp?view=activity`),
    ])
      .then(([p, s, st, pur, act]) => {
        setProfile(p);
        setSummary(s);
        setStatement(st.lines);
        setPurchases(pur.data);
        setActivity(act.logs ?? []);
      })
      .finally(() => setLoading(false));
  }, [id]);

  async function handleDelete() {
    const label = profile?.name?.trim() || "this vendor";
    const ok = await confirm({
      title: "Delete vendor?",
      message: `Delete "${label}"? Only vendors with no bills, payments, or other operational records can be removed. Catalog SKUs on this vendor are also removed. This cannot be undone.`,
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

  if (loading) {
    return (
      <AdminPageLayout>
        <AdminDetailSkeleton />
      </AdminPageLayout>
    );
  }
  if (!profile || !summary) return <p className="p-4 text-sm">Vendor not found.</p>;

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title={profile.name ?? "Vendor"}
        description={profile.vendor_type ?? "—"}
        backHref="/admin/vendors"
        breadcrumb={[
          { label: "Vendors", href: "/admin/vendors" },
          { label: profile.name ?? "Vendor" },
        ]}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSettlementOpen(true)}
              disabled={summary.balanceDue <= 0}
            >
              <HandCoins data-icon="inline-start" />
              Settle account
            </Button>
            <Link href={`/admin/vendors/${id}/edit`} className={buttonVariants({ variant: "outline" })}>
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
          </>
        }
      />

      <div className="space-y-1 text-sm text-muted-foreground">
        <p>{profile.address ?? "—"}</p>
        <p>{profile.email ?? "—"} · {profile.phone ?? "—"} · PO: {profile.po_box ?? "—"}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-slate-500">Outstanding Payables</p>
          <p className="text-lg font-semibold tabular-nums">{formatCurrencyAmount(summary.balanceDue)}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-slate-500">Total Purchase</p>
          <p className="text-lg font-semibold tabular-nums">{formatCurrencyAmount(summary.billTotal)}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-slate-500">Opening Balance</p>
          <p className="text-lg font-semibold tabular-nums">{formatCurrencyAmount(summary.openingBalance)}</p>
        </div>
      </div>

      <div className="grid gap-2 text-sm sm:grid-cols-4">
        <p>Vendor Credit: {formatCurrencyAmount(summary.creditTotal)}</p>
        <p>Credit Balance: {formatCurrencyAmount(summary.creditBalance)}</p>
        <p>Refund: {formatCurrencyAmount(summary.refundTotal)}</p>
        <p>OB Date: {summary.openingBalanceDate ?? "—"}</p>
      </div>

      <div className="flex gap-2 border-b">
        {(["statement", "purchases", "activity"] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={`px-3 py-2 text-sm ${tab === t ? "border-b-2 border-primary font-medium" : "text-muted-foreground"}`}
            onClick={() => setTab(t)}
          >
            {t === "statement" ? "Statement" : t === "purchases" ? "Purchases" : "Activity Log"}
          </button>
        ))}
      </div>

      {settlementOpen ? (
        <ErpSettlementFormView
          side="supplier"
          variant="modal"
          open={settlementOpen}
          onOpenChange={setSettlementOpen}
          initialPartyId={id}
          initialPartyLabel={profile.name ?? ""}
          onSuccess={() => {
            setSettlementOpen(false);
            setLoading(true);
            Promise.all([
              adminGet<VendorErpSummary>(`vendors/${id}/erp`),
              adminGet<{ lines: VendorStatementLine[] }>(`vendors/${id}/erp?view=statement`),
            ]).then(([s, st]) => {
              setSummary(s);
              setStatement(st.lines);
            }).finally(() => setLoading(false));
          }}
        />
      ) : null}

      {tab === "statement" && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Store</th>
                <th className="px-3 py-2">Transaction</th>
                <th className="px-3 py-2">Details</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Payments</th>
                <th className="px-3 py-2">Balance</th>
              </tr>
            </thead>
            <tbody>
              {statement.map((l, i) => (
                <tr key={i} className="border-t">
                  <td className="px-3 py-2">{l.date}</td>
                  <td className="px-3 py-2">{l.storeName ?? "—"}</td>
                  <td className="px-3 py-2">{l.transactionType}</td>
                  <td className="px-3 py-2">{l.details}</td>
                  <td className="px-3 py-2 tabular-nums">{formatCurrencyAmount(l.amount)}</td>
                  <td className="px-3 py-2 tabular-nums">{formatCurrencyAmount(l.payments)}</td>
                  <td className="px-3 py-2 tabular-nums">{formatCurrencyAmount(l.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "purchases" && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Bill #</th>
                <th className="px-3 py-2">Store</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Balance Due</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((b) => (
                <tr key={b.id} className="border-t">
                  <td className="px-3 py-2 text-muted-foreground">
                    <AdminTableDateTime documentDate={b.purchase_date} activity={b} />
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/admin/erp/purchase-bills/${b.id}`} className="text-primary hover:underline">
                      {b.purchase_bill_number}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{b.store_name ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{formatCurrencyAmount(b.total_amount)}</td>
                  <td className="px-3 py-2 tabular-nums">{formatCurrencyAmount(b.balance_due)}</td>
                  <td className="px-3 py-2">{b.display_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "activity" && (
        <div className="space-y-2">
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity logged.</p>
          ) : (
            activity.map((log) => (
              <div key={log.id} className="rounded border p-3 text-sm">
                <p className="font-medium">{log.action.replace(/_/g, " ")}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(log.created_at).toLocaleString()} · By {formatAuditLogUserDetail(log)}
                </p>
                <p className="text-muted-foreground">{log.description ?? "—"}</p>
              </div>
            ))
          )}
        </div>
      )}
    </AdminPageLayout>
  );
}
