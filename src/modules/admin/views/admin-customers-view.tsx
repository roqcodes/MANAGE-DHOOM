"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import type { AdminUser } from "@/common/admin/types";
import { AdminPageLoadError } from "@/modules/feedback/components/admin-page-load-error";
import { EMPTY_CUSTOMER_STATS } from "@/modules/admin/lib/catalog-loading-defaults";
import { CustomersPanel } from "@/modules/customers/components/customers-panel";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import { useErpFormModal } from "@/modules/admin/ui";
import type { CustomerStats } from "@/modules/customers/services/customers.service";
import { AdminCustomerFormView } from "@/modules/admin/views/admin-customer-form-view";
import { useAddressHierarchyFilters } from "@/modules/customers/hooks/use-address-hierarchy-filters";

type CustomersPayload = {
  data: AdminUser[];
  total: number;
  stats: CustomerStats;
};

export function AdminCustomersView() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const { isOpen, mode, editId, modalProps, openNew } = useErpFormModal("/admin/customers");
  const address = useAddressHierarchyFilters({
    initial: {
      cityId: searchParams.get("cityId"),
      streetId: searchParams.get("streetId"),
      mallId: searchParams.get("mallId"),
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("cityId");
    params.delete("streetId");
    params.delete("mallId");
    for (const [key, value] of Object.entries(address.listParams)) {
      params.set(key, value);
    }
    if (Object.keys(address.listParams).length > 0) {
      params.delete("page");
    }
    const next = params.toString();
    const current = searchParams.toString();
    if (next !== current) {
      router.replace(next ? `/admin/customers?${next}` : "/admin/customers");
    }
  }, [address.listParams, router, searchParams]);

  const listQuery = new URLSearchParams({ page: String(page) });
  for (const [key, value] of Object.entries(address.listParams)) {
    listQuery.set(key, value);
  }

  const { data, isPending, isError, error } = useQuery({
    queryKey: [...adminQueryKeys.customersList(page), address.listParams],
    queryFn: () => adminGet<CustomersPayload>(`customers?${listQuery.toString()}`),
    placeholderData: keepPreviousData,
  });
  const initialLoading = isPending && !data;

  function handleFormSuccess() {
    void queryClient.invalidateQueries({ queryKey: adminQueryKeys.customersList(page) });
  }

  if (isError) {
    return (
      <AdminPageLoadError
        title="Couldn't load customers"
        error={error}
        onRetry={() =>
          void queryClient.invalidateQueries({ queryKey: adminQueryKeys.customersList(page) })
        }
      />
    );
  }
  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-3 sm:px-4 sm:py-4">
      <CustomersPanel
        initialLoading={initialLoading}
        users={data?.data ?? []}
        total={data?.total ?? 0}
        page={page}
        stats={data?.stats ?? EMPTY_CUSTOMER_STATS}
        onAddCustomer={() => openNew()}
        addressFilterFields={address.toolbarProps}
      />

      {isOpen ? (
        <AdminCustomerFormView
          variant="modal"
          mode={mode}
          customerId={editId ?? undefined}
          open={modalProps.open}
          onOpenChange={modalProps.onOpenChange}
          onSuccess={handleFormSuccess}
        />
      ) : null}
    </div>
  );
}
