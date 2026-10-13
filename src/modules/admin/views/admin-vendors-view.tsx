"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import type { Vendor, VendorCatalogStats } from "@/common/admin/types";
import { EMPTY_VENDOR_CATALOG_STATS } from "@/modules/admin/lib/catalog-loading-defaults";
import { VendorsPanel } from "@/modules/vendors/components/vendors-panel";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";

type VendorsPayload = {
  data: Vendor[];
  total: number;
  page: number;
  stats: VendorCatalogStats;
};

export function AdminVendorsView() {
  const searchParams = useSearchParams();
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));

  const { data, isPending, isError, error } = useQuery({
    queryKey: adminQueryKeys.vendors(page),
    queryFn: () => adminGet<VendorsPayload>(`vendors?page=${page}`),
    placeholderData: keepPreviousData,
  });
  const initialLoading = isPending && !data;

  if (isError) {
    return (
      <div className="mx-auto w-full max-w-7xl px-3 py-6 sm:px-4">
        <div className="flex items-start gap-3 rounded-xl border border-rose-200/60 bg-rose-50/40 p-5">
          <AlertTriangle className="size-5 shrink-0 text-rose-600" />
          <div>
            <p className="text-sm font-semibold text-rose-900">
              Failed to load vendors.
            </p>
            <p className="mt-1 text-sm text-rose-700">
              {error instanceof Error ? error.message : "Unknown error."}
            </p>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-3 sm:px-4 sm:py-4">
      <VendorsPanel
        initialLoading={initialLoading}
        vendors={data?.data ?? []}
        total={data?.total ?? 0}
        page={data?.page ?? page}
        stats={data?.stats ?? EMPTY_VENDOR_CATALOG_STATS}
      />
    </div>
  );
}
