import Link from "next/link";
import { format } from "date-fns";
import { ArrowRight } from "lucide-react";

import { StatusBadge } from "@/modules/admin/components/status-badge";
import type { VendorRecentPoRow } from "@/modules/vendor/types";
import { CurrencyAmount } from "@/components/currency-amount";
import { formatCurrencyAmount } from "@/lib/format-currency";

function formatMoney(n: number | null) {
  if (n == null) return "—";
  return formatCurrencyAmount(n, { minimumFractionDigits: 2 });
}

export function VendorPoActivityFeed({
  recent,
}: {
  recent: VendorRecentPoRow[];
}) {
  return (
    <div className="rounded-[24px] border border-slate-100 bg-white p-6 shadow-[0_4px_16px_rgba(26,26,46,0.04)]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900">
            Purchase order updates
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Latest activity across your POs — open one to accept or mark delivered.
          </p>
        </div>
        <Link
          href="/vendor/purchase-orders"
          className="inline-flex items-center gap-1 text-[13px] font-extrabold text-[#EB205F] hover:underline"
        >
          View all
          <ArrowRight size={14} />
        </Link>
      </div>

      {recent.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm font-medium text-slate-500">
          No purchase orders yet. When DHOOM TRADING creates a PO against your supply,
          it will show up here.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {recent.map((po) => (
            <li key={po.id}>
              <Link
                href={`/vendor/purchase-orders/${po.id}`}
                className="flex flex-wrap items-center justify-between gap-3 py-3 transition hover:bg-slate-50/80 sm:px-2"
              >
                <div className="min-w-0">
                  <p className="font-mono text-[13px] font-bold text-slate-900">
                    {po.id.slice(0, 8)}…
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {po.created_at
                      ? format(new Date(po.created_at), "MMM d, yyyy · h:mm a")
                      : "—"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <StatusBadge status={po.status ?? "—"} />
                  <span className="text-sm font-extrabold tabular-nums text-slate-900">
                    {formatMoney(po.total_amount)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
