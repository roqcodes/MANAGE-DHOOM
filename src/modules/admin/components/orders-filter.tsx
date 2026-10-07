"use client";

import { useRouter, useSearchParams } from "next/navigation";

import {
  ORDER_STATUS_FILTERS,
  type OrderStatusFilter,
} from "@/common/admin/types";

export function OrdersFilter() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const active = (searchParams.get("status") ?? "all") as OrderStatusFilter;

  return (
    <div className="flex flex-wrap gap-2">
      {ORDER_STATUS_FILTERS.map((status) => (
        <button
          key={status}
          onClick={() => router.push(`/admin/orders?status=${status}`)}
          className={[
            "rounded-full px-4 py-2 text-[13px] font-bold transition-colors",
            active === status
              ? "bg-[#2563EB] text-white shadow-sm"
              : "bg-white text-slate-500 hover:bg-slate-100",
          ].join(" ")}
        >
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </button>
      ))}
    </div>
  );
}
