"use client";

import type { ReactNode } from "react";
import { useParams } from "next/navigation";

import { AdminRouteSuspense } from "@/modules/admin/components/admin-route-suspense";
import { AdminBusinessSettingsView } from "@/modules/admin/views/admin-business-settings-view";
import { AdminConfigView } from "@/modules/admin/views/admin-config-view";
import { AdminDashboardView } from "@/modules/admin/views/admin-dashboard-view";
import { AdminDeliveryView } from "@/modules/admin/views/admin-delivery-view";
import { AdminInventoryView } from "@/modules/admin/views/admin-inventory-view";
import { AdminOrderDetailView } from "@/modules/admin/views/admin-order-detail-view";
import { AdminOrdersView } from "@/modules/admin/views/admin-orders-view";
import { AdminProductDetailView } from "@/modules/admin/views/admin-product-detail-view";
import { AdminProductsView } from "@/modules/admin/views/admin-products-view";
import { AdminPurchaseOrdersView } from "@/modules/admin/views/admin-purchase-orders-view";
import { AdminPurchaseOrderRouteView } from "@/modules/admin/views/purchasing/purchase-order-route-view";
import { AdminUsersView } from "@/modules/admin/views/admin-users-view";
import { AdminVendorDetailView } from "@/modules/admin/views/admin-vendor-detail-view";
import { AdminVendorsView } from "@/modules/admin/views/admin-vendors-view";
import { AdminBrandsView } from "@/modules/admin/views/admin-brands-view";
import { AdminCategoriesView } from "@/modules/admin/views/admin-categories-view";
import { AdminCustomerDetailView } from "@/modules/admin/views/admin-customer-detail-view";
import { ErpFormRouteRedirect } from "@/modules/admin/components/erp-form-route-redirect";
import { AdminCustomersView } from "@/modules/admin/views/admin-customers-view";

function AdminNotFound() {
  return (
    <div className="px-3 py-6 text-sm font-semibold text-slate-600 sm:px-4">
      This admin page does not exist.
    </div>
  );
}

export function AdminCatchAllView() {
  const params = useParams();
  const slug = ((params.slug as string[] | undefined) ?? []).slice();

  let inner: ReactNode;

  if (slug.length === 0) {
    inner = <AdminDashboardView />;
  } else if (slug.length === 1) {
    const seg = slug[0];
    if (seg === "products") inner = <AdminProductsView />;
    else if (seg === "orders") inner = <AdminOrdersView />;
    else if (seg === "vendors") inner = <AdminVendorsView />;
    else if (seg === "inventory") inner = <AdminInventoryView />;
    else if (seg === "delivery") inner = <AdminDeliveryView />;
    else if (seg === "users") inner = <AdminUsersView />;
    else if (seg === "config") inner = <AdminConfigView />;
    else if (seg === "business") inner = <AdminBusinessSettingsView />;
    else if (seg === "purchase-orders") inner = <AdminPurchaseOrdersView />;
    else if (seg === "customers") inner = <AdminCustomersView />;
    else if (seg === "categories") inner = <AdminCategoriesView />;
    else if (seg === "brands") inner = <AdminBrandsView />;
    else inner = <AdminNotFound />;
  } else if (slug.length === 2) {
    const [a, b] = slug;
    if (!b || b.length === 0) {
      inner = <AdminNotFound />;
    } else if (a === "products") inner = <AdminProductDetailView />;
    else if (a === "orders") inner = <AdminOrderDetailView />;
    else if (a === "vendors") inner = <AdminVendorDetailView />;
    else if (a === "purchase-orders") inner = <AdminPurchaseOrderRouteView />;
    else if (a === "customers" && b === "new") {
      inner = <ErpFormRouteRedirect listPath="/admin/customers" form="new" />;
    }
    else if (a === "customers") inner = <AdminCustomerDetailView />;
    else inner = <AdminNotFound />;
  } else if (slug.length === 3) {
    const [a, b, c] = slug;
    if (a === "purchase-orders" && c === "edit" && b) {
      inner = <AdminPurchaseOrderRouteView />;
    } else if (a === "customers" && c === "edit" && b) {
      inner = (
        <ErpFormRouteRedirect listPath="/admin/customers" form="edit" id={b} />
      );
    } else {
      inner = <AdminNotFound />;
    }
  } else {
    inner = <AdminNotFound />;
  }

  return <AdminRouteSuspense>{inner}</AdminRouteSuspense>;
}
