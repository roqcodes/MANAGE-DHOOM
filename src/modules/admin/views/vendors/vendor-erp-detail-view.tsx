"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import type {
  ErpPurchaseBillListRow,
  VendorErpProfile,
  VendorErpSummary,
  VendorStatementLine,
} from "@/common/erp/purchasing-types";
import type { AuditLogEntry } from "@/common/erp/types";
import { AdminDetailSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { formatAuditLogUserDetail } from "@/modules/erp/lib/audit-log-display";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { AdminPageHeader, AdminPageLayout } from "@/modules/admin/ui";
import { buttonVariants } from "@/components/ui/button";

type AuditLog = AuditLogEntry;

export function VendorErpDetailView() {
  const params = useParams();
  const id = params.id as string;
  const [profile, setProfile] = useState<VendorErpProfile | null>(null);
  const [summary, setSummary] = useState<VendorErpSummary | null>(null);
  const [statement, setStatement] = useState<VendorStatementLine[]>([]);
  const [purchases, setPurchases] = useState<ErpPurchaseBillListRow[]>([]);
  const [activity, setActivity] = useState<AuditLog[]>([]);
  const [tab, setTab] = useState<"statement" | "purchases" | "activity">("statement");
  const [loading, setLoading] = useState(true);

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
          <Link href={`/admin/vendors/${id}/edit`} className={buttonVariants({ variant: "outline" })}>
            Edit
          </Link>
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
                  <td className="px-3 py-2">{b.purchase_date}</td>
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
