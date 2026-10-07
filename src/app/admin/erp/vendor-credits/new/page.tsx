"use client";

import { useSearchParams } from "next/navigation";

import { ErpFormRouteRedirect } from "@/modules/admin/components/erp-form-route-redirect";

export default function NewVendorCreditPage() {
  const searchParams = useSearchParams();
  const billId = searchParams.get("billId") ?? undefined;
  return (
    <ErpFormRouteRedirect
      listPath="/admin/erp/vendor-credits"
      form="new"
      extra={billId ? { billId } : undefined}
    />
  );
}
