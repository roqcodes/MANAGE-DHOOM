"use client";

import type { Vendor } from "@/common/admin/types";
import { cn } from "@/lib/utils";

export type VendorStatusFilter = "all" | "active" | "inactive";

export const VENDOR_STATUS_FILTERS: {
  id: VendorStatusFilter;
  label: string;
}[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "inactive", label: "Inactive" },
];

export function formatVendorId(vendor: Vendor) {
  const shortId = vendor.id.split("-")[0]?.slice(0, 4).toUpperCase() ?? "0000";
  return `VND-${shortId}`;
}

export function matchesVendorStatusFilter(
  vendor: Vendor,
  filter: VendorStatusFilter,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "active":
      return vendor.is_active === true;
    case "inactive":
      return vendor.is_active !== true;
    default:
      return true;
  }
}

export function VendorStatusBadge({ vendor }: { vendor: Vendor }) {
  const active = vendor.is_active === true;

  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
        active
          ? "bg-emerald-100 text-emerald-800"
          : "bg-muted text-muted-foreground",
      )}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}
