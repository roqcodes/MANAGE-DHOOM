"use client";

import { useSearchParams } from "next/navigation";

import { ErpFormRouteRedirect } from "@/modules/admin/components/erp-form-route-redirect";

export default function AdminPurchaseBillNewPage() {
  const searchParams = useSearchParams();
  const poId = searchParams.get("poId") ?? undefined;
  return (
    <ErpFormRouteRedirect
      listPath="/admin/erp/purchase-bills"
      form="new"
      extra={poId ? { poId } : undefined}
    />
  );
}
