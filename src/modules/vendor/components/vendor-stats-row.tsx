import { ClipboardList, Package, Truck, Clock } from "lucide-react";

import type { VendorDashboardStats } from "@/modules/vendor/types";

export function VendorStatsRow({ stats }: { stats: VendorDashboardStats }) {
  const cards = [
    {
      label: "Pending POs",
      value: stats.pendingPo,
      hint: "Awaiting acceptance",
      icon: Clock,
      tone: "text-amber-600",
      bg: "bg-amber-50",
    },
    {
      label: "To ship",
      value: stats.acceptedPo,
      hint: "Mark delivered when sent",
      icon: Truck,
      tone: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "Completed",
      value: stats.deliveredPo,
      hint: "Delivered POs",
      icon: ClipboardList,
      tone: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      label: "Supply SKUs",
      value: stats.supplySkus,
      hint:
        stats.lowStockSkus > 0
          ? `${stats.lowStockSkus} SKU${stats.lowStockSkus !== 1 ? "s" : ""} low on stock (≤10)`
          : "Listed variants",
      icon: Package,
      tone: "text-slate-700",
      bg: "bg-slate-100",
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <div
            key={c.label}
            className="rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_4px_16px_rgba(26,26,46,0.04)]"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                  {c.label}
                </p>
                <p className="mt-1 text-3xl font-black tabular-nums text-slate-900">
                  {c.value}
                </p>
                <p className="mt-1 text-xs font-medium text-slate-500">{c.hint}</p>
              </div>
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${c.bg}`}
              >
                <Icon size={22} className={c.tone} strokeWidth={2} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
