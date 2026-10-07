"use client";

import { useParams } from "next/navigation";

import { ErpFormRouteRedirect } from "@/modules/admin/components/erp-form-route-redirect";
import { PurchaseOrderDetailErpView } from "@/modules/admin/views/purchasing/purchase-order-detail-erp-view";

export function AdminPurchaseOrderRouteView() {
  const params = useParams();
  const slug = (params.slug as string[] | undefined) ?? [];
  const segment = slug[1];

  if (segment === "new") {
    return <ErpFormRouteRedirect listPath="/admin/purchase-orders" form="new" />;
  }

  if (slug.length >= 3 && slug[2] === "edit" && segment) {
    return <ErpFormRouteRedirect listPath="/admin/purchase-orders" form="edit" id={segment} />;
  }

  if (segment) {
    return <PurchaseOrderDetailErpView poId={segment} />;
  }

  return null;
}
