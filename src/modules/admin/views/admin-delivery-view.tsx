"use client";

import { Truck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import type { DBUser } from "@/common/admin/types";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";

export function AdminDeliveryView() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: adminQueryKeys.delivery(),
    queryFn: () => adminGet<{ riders: DBUser[] }>("delivery"),
  });

  if (isPending && !data) return <AdminPageSkeleton />;
  if (isError) {
    return (
      <div className="px-3 py-6 text-sm font-semibold text-red-600 sm:px-4">
        {error instanceof Error ? error.message : "Failed to load delivery riders."}
      </div>
    );
  }
  if (!data) return <AdminPageSkeleton />;

  const { riders } = data;

  return (
    <div className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-5 sm:py-4">
      <header className="mb-8">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          Delivery Manager
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {riders.length} verified delivery rider
          {riders.length !== 1 ? "s" : ""} active.
        </p>
      </header>

      <div className="overflow-hidden rounded-[24px] border border-slate-100 bg-white shadow-[0_4px_16px_rgba(26,26,46,0.04)]">
        {riders.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <Truck size={48} className="text-slate-200" />
            <p className="text-sm font-semibold text-slate-400">
              No verified delivery riders found.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-50">
            {riders.map((rider) => (
              <li
                key={rider.id}
                className="flex flex-wrap items-center gap-3 px-4 py-4 transition-colors hover:bg-slate-50/70 sm:gap-4 sm:px-6"
              >
                <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#2563EB]/10 text-[15px] font-extrabold text-[#2563EB]">
                  {rider.name?.[0]?.toUpperCase() ?? "R"}
                  <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900">
                    {rider.name ?? "Rider"}
                  </p>
                  <p className="truncate text-xs text-slate-500">{rider.email}</p>
                </div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-emerald-700">
                  Active
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
