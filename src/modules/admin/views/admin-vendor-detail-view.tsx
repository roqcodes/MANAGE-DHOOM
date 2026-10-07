"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useParams } from "next/navigation";

import type {
  Vendor,
  VendorProductWithVariant,
  VariantWithProduct,
} from "@/common/admin/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AdminBreadcrumb } from "@/modules/admin/components/admin-breadcrumb";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { VendorDetailPanel } from "@/modules/vendors/components/vendor-detail-panel";
import { adminGetNullable } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";

type VendorDetailPayload = {
  vendor: Vendor;
  vendorProducts: VendorProductWithVariant[];
  availableVariants: VariantWithProduct[];
};

function VendorDetailNav({ vendorName }: { vendorName?: string | null }) {
  return (
    <AdminBreadcrumb
      backHref="/admin/vendors"
      items={[
        { label: "Vendors", href: "/admin/vendors" },
        { label: vendorName?.trim() || "Vendor" },
      ]}
    />
  );
}

export function AdminVendorDetailView() {
  const params = useParams();
  const slug = (params.slug as string[] | undefined) ?? [];
  const id =
    slug[0] === "vendors" && typeof slug[1] === "string" ? slug[1] : "";

  const { data, isPending, isError, error } = useQuery({
    queryKey: adminQueryKeys.vendorDetail(id),
    queryFn: () => adminGetNullable<VendorDetailPayload>(`vendors/${id}`),
    enabled: Boolean(id),
    placeholderData: keepPreviousData,
  });

  if (!id) {
    return (
      <div className="mx-auto w-full max-w-7xl px-3 py-2.5 sm:px-4">
        <p className="text-sm text-muted-foreground">Missing vendor id.</p>
      </div>
    );
  }

  if (isPending && data === undefined) return <AdminPageSkeleton />;
  if (isError) {
    return (
      <div className="mx-auto w-full max-w-7xl px-3 py-2.5 sm:px-4">
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Failed to load vendor</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : "Unknown error."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  if (data === null) {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-3 py-2.5 sm:px-4">
        <VendorDetailNav />
        <p className="text-sm text-muted-foreground">This vendor could not be found.</p>
      </div>
    );
  }

  const { vendor, vendorProducts, availableVariants } = data;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-3 py-2.5 font-sans sm:px-4">
      <VendorDetailNav vendorName={vendor.name} />

      <VendorDetailPanel
        vendor={vendor}
        vendorProducts={vendorProducts}
        availableVariants={availableVariants}
      />
    </div>
  );
}
