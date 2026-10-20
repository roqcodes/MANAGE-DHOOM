"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";

import type { Vendor, VendorCatalogStats } from "@/common/admin/types";
import { EMPTY_VENDOR_CATALOG_STATS } from "@/modules/admin/lib/catalog-loading-defaults";
import { VendorsPanel } from "@/modules/vendors/components/vendors-panel";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import { AdminPageLoadError } from "@/modules/feedback/components/admin-page-load-error";

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
    return <AdminPageLoadError title="Failed to load vendors." error={error} />;
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
