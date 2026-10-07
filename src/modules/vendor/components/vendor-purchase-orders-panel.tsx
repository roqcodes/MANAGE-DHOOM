"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { ClipboardList } from "lucide-react";

import type { VendorPurchaseOrderListRow } from "@/modules/vendor/types";
import { VENDOR_PO_STATUS_FILTERS } from "@/modules/vendor/types";
import type { VendorPoStatusFilter } from "@/modules/vendor/types";
import { StatusBadge } from "@/modules/admin/components/status-badge";
import { EmptyState, TableShell } from "@/modules/admin/components/empty-state";
import { Pagination } from "@/modules/admin/components/pagination";
import { currencyLabel, formatCurrencyAmount } from "@/lib/format-currency";

function formatMoney(n: number | null) {
  if (n == null) return "—";
  return formatCurrencyAmount(n, { minimumFractionDigits: 2 });
}

export function VendorPurchaseOrdersPanel({
  orders,
  total,
  page,
  statusFilter,
}: {
  orders: VendorPurchaseOrderListRow[];
  total: number;
  page: number;
  statusFilter: VendorPoStatusFilter;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setStatus(next: VendorPoStatusFilter) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("status", next);
    params.delete("page");
    router.push(`/vendor/purchase-orders?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {VENDOR_PO_STATUS_FILTERS.map((s) => {
          const active = statusFilter === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={[
                "rounded-full px-3.5 py-1.5 text-[12px] font-extrabold uppercase tracking-wide transition",
                active
                  ? "bg-[#2563EB] text-white"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200",
              ].join(" ")}
            >
              {s}
            </button>
          );
        })}
      </div>

      <TableShell>
        {orders.length === 0 ? (
          <EmptyState
            icon={<ClipboardList size={48} strokeWidth={1.25} />}
            message={`No ${statusFilter} purchase orders.`}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-start">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-3">PO</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-end">{currencyLabel("Total")}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr
                    key={o.id}
                    className="border-b border-slate-50 transition hover:bg-slate-50/50 last:border-0"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/vendor/purchase-orders/${o.id}`}
                        className="text-[13px] font-bold text-[#2563EB] hover:underline"
                      >
                        {o.id.slice(0, 8)}…
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-slate-600">
                      {o.created_at
                        ? format(new Date(o.created_at), "MMM d, yyyy HH:mm")
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={o.status ?? "—"} />
                    </td>
                    <td className="px-4 py-3 text-end text-[13px] font-semibold text-slate-900">
                      {formatMoney(o.total_amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          total={total}
          page={page}
          basePath="/vendor/purchase-orders"
          extraParams={{ status: statusFilter }}
        />
      </TableShell>
    </div>
  );
}
