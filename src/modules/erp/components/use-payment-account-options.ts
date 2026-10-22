"use client";

import { useQuery } from "@tanstack/react-query";

import type { PaidThroughAccountOption } from "@/common/erp/sales-types";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";

export type PaymentAccountOptions = {
  depositAccounts: PaidThroughAccountOption[];
  expenseAccounts: PaidThroughAccountOption[];
};

export function usePaymentAccountOptions(storeId: string | undefined) {
  return useQuery({
    queryKey: adminQueryKeys.paymentAccountOptions(storeId),
    queryFn: () => {
      const q = storeId ? `?view=account-options&storeId=${encodeURIComponent(storeId)}` : "?view=account-options";
      return adminGet<PaymentAccountOptions>(`erp/payments${q}`);
    },
    enabled: Boolean(storeId),
    staleTime: 60_000,
  });
}
