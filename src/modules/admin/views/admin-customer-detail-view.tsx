"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useParams, useSearchParams } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AdminBreadcrumb } from "@/modules/admin/components/admin-breadcrumb";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { adminGetNullable } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import { CustomerDetailPanel } from "@/modules/customers/components/customer-detail-panel";
import type { CustomerDetailsResponse } from "@/modules/customers/services/customers.service";

function CustomerDetailNav({ customerName }: { customerName?: string | null }) {
  return (
    <AdminBreadcrumb
      backHref="/admin/customers"
      items={[
        { label: "Customers", href: "/admin/customers" },
        { label: customerName?.trim() || "Customer" },
      ]}
    />
  );
}

export function AdminCustomerDetailView() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = (params.slug as string[] | undefined) ?? [];
  const id = slug[0] === "customers" && typeof slug[1] === "string" ? slug[1] : "";

  const txPage = Math.max(0, parseInt(searchParams.get("txPage") ?? "0", 10));

  const { data, isPending, isError, error } = useQuery({
    queryKey: adminQueryKeys.customerDetail(id, txPage),
    queryFn: () => adminGetNullable<CustomerDetailsResponse>(`customers/${id}?txPage=${txPage}`),
    enabled: Boolean(id),
    placeholderData: keepPreviousData,
  });

  if (!id) {
    return (
      <div className="mx-auto w-full max-w-7xl px-3 py-2.5 sm:px-4">
        <p className="text-sm text-muted-foreground">Missing customer id.</p>
      </div>
    );
  }

  if (isPending && data === undefined) return <AdminPageSkeleton />;
  if (isError) {
    return (
      <div className="mx-auto w-full max-w-7xl px-3 py-2.5 sm:px-4">
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Failed to load customer</AlertTitle>
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
        <CustomerDetailNav />
        <p className="text-sm text-muted-foreground">This customer could not be found.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-3 py-2.5 font-sans sm:px-4">
      <CustomerDetailNav customerName={data.summary.name} />

      <CustomerDetailPanel details={data} txPage={txPage} orders={data.orders} />
    </div>
  );
}
