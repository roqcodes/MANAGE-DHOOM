import type { VendorProductWithVariant } from "@/common/admin/types";

export const VENDOR_PO_STATUS_FILTERS = [
  "pending",
  "accepted",
  "delivered",
] as const;

export type VendorPoStatusFilter = (typeof VENDOR_PO_STATUS_FILTERS)[number];

export interface VendorPurchaseOrderListRow {
  id: string;
  status: string | null;
  total_amount: number | null;
  created_at: string | null;
}

export interface VendorPurchaseOrderItemRow {
  id: string;
  variant_id: string | null;
  quantity: number | null;
  price: number | null;
  product_variants: {
    id: string;
    name: string | null;
    products: { id: string; name: string | null } | null;
  } | null;
}

export interface VendorPurchaseOrderDetail {
  id: string;
  vendor_id: string | null;
  status: string | null;
  total_amount: number | null;
  created_at: string | null;
  purchase_order_items: VendorPurchaseOrderItemRow[];
}

/** Active catalog variant not yet on the vendor's supply list. */
export interface AvailableCatalogVariantRow {
  id: string;
  name: string | null;
  products: {
    id: string;
    name: string | null;
    image_url: string | null;
    is_active: boolean | null;
    categories: { name: string | null } | null;
  } | null;
}

export type { VendorProductWithVariant };

// ─── Dashboard & sidebar ─────────────────────────────────────────────────────

export interface VendorDashboardStats {
  pendingPo: number;
  acceptedPo: number;
  deliveredPo: number;
  supplySkus: number;
  lowStockSkus: number;
}

export interface VendorRecentPoRow {
  id: string;
  status: string | null;
  total_amount: number | null;
  created_at: string | null;
}

export interface VendorProfileRecord {
  id: string;
  name: string | null;
  contact: string | null;
  is_active: boolean | null;
  created_at: string | null;
}
