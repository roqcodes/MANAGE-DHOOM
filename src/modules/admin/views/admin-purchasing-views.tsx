"use client";

import { PurchaseBillsListView } from "@/modules/admin/views/purchasing/purchase-bills-list-view";
import { VendorCreditsListView } from "@/modules/admin/views/purchasing/vendor-credits-list-view";
import { LandedCostsListView } from "@/modules/admin/views/purchasing/landed-costs-list-view";

export function AdminPurchaseBillsView() {
  return <PurchaseBillsListView />;
}

export function AdminSupplierPaymentsView() {
  return null;
}

export function AdminVendorCreditsView() {
  return <VendorCreditsListView />;
}

export function AdminLandedCostsView() {
  return <LandedCostsListView />;
}
