"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import type { AdminUser } from "@/common/admin/types";
import { AdminPageLoadError } from "@/modules/feedback/components/admin-page-load-error";
import { EMPTY_CUSTOMER_STATS } from "@/modules/admin/lib/catalog-loading-defaults";
import { CustomersPanel } from "@/modules/customers/components/customers-panel";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import { useErpFormModal } from "@/modules/admin/ui";
import type { CustomerStats } from "@/modules/customers/services/customers.service";
import { AdminCustomerFormView } from "@/modules/admin/views/admin-customer-form-view";

type CustomersPayload = {
  data: AdminUser[];
  total: number;
  stats: CustomerStats;
};

export function AdminCustomersView() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const { isOpen, mode, editId, modalProps, openNew } = useErpFormModal("/admin/customers");

  const { data, isPending, isError, error } = useQuery({
    queryKey: adminQueryKeys.customersList(page),
    queryFn: () => adminGet<CustomersPayload>(`customers?page=${page}`),
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
