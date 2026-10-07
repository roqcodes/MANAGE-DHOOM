export type OrderStatus =
  | "pending"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";

export const ORDER_STATUS_FILTERS = [
  "all",
  "pending",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
] as const;

export type OrderStatusFilter = (typeof ORDER_STATUS_FILTERS)[number];

export const PAGE_SIZE = 20;

export interface Paginated<T> {
  data: T[];
  total: number;
}

// ─── Core rows ────────────────────────────────────────────────────────────────

export interface DBUser {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  is_verified: boolean | null;
  created_at: string | null;
}

export interface AdminUser extends DBUser {
  order_count?: number;
  customer_number?: string | null;
  company_name?: string | null;
  location?: string | null;
  opening_balance?: number | null;
  receivables?: number | null;
  credit_limit?: number | null;
}

export interface Vendor {
  id: string;
  name: string | null;
  contact: string | null;
  is_active: boolean | null;
  created_at: string | null;
}

/** Admin vendors list summary (server-computed). */
export interface VendorCatalogStats {
  total: number;
  active: number;
  inactive: number;
  /** Rows in `vendor_products` (supply lines across all vendors). */
  supplyLines: number;
}

export interface Category {
  id: string;
  name: string | null;
  parent_id: string | null;
  thumbnail_url: string | null;
  image_url: string | null;
  sort_order: number | null;
  is_active: boolean | null;
  slug: string | null;
  description: string | null;
  created_at: string | null;
  updated_at?: string | null;
}

export interface Brand {
  id: string;
  name: string | null;
  logo_url: string | null;
  image_url: string | null;
  sort_order: number | null;
  is_active: boolean | null;
  slug: string | null;
  description: string | null;
  created_at: string | null;
  updated_at?: string | null;
}

export type ProductItemType = "goods" | "service";

export interface Product {
  id: string;
  name: string | null;
  description: string | null;
  category_id: string | null;
  brand_id: string | null;
  image_url: string | null;
  is_active: boolean | null;
  use_smart_pricing: boolean | null;
  specs: Record<string, string> | null;
  variant_layout?: "flat" | "grouped" | null;
  item_type?: ProductItemType | null;
  hsn_sac?: string | null;
  /** Product-level pricing when no variants exist (ERP / manual invoicing). */
  price?: number | null;
  mrp?: number | null;
  barcode?: string | null;
  purchase_price?: number | null;
  tax_rate_percent?: number | null;
  created_at: string | null;
}

export interface ProductWithCategory extends Product {
  categories: Category | null;
  brands: Brand | null;
}

/** List-row aggregates for admin products table (server-computed per page). */
export interface ProductListSummary {
  stock_total: number;
  price_min: number | null;
  mrp_min: number | null;
  variant_count: number;
  sku_label: string | null;
  /** Primary variant barcode (first SKU). */
  barcode: string | null;
  product_code: string | null;
  purchase_price: number | null;
  tax_rate_percent: number | null;
  /** Store-scoped stock when a store filter is active. */
  store_stock: number | null;
  store_name: string | null;
}

export type ProductWithCategoryListItem = ProductWithCategory & ProductListSummary;

/** Admin products catalog summary (server-computed). */
export interface ProductCatalogStats {
  total: number;
  active: number;
  inactive: number;
  categoriesCount: number;
  uncategorized: number;
  categoryCounts: Record<string, number>;
  outOfStock: number;
  inventoryValue: number;
}

/** Admin product detail “at a glance” (server-computed). */
export interface ProductAtGlanceMetrics {
  centralStockTotal: number;
  /** Customer-facing list prices for SKUs with central stock > 0. */
  listPriceMin: number | null;
  listPriceMax: number | null;
  variantsInStock: number;
  /** Admin-only suggestions when smart pricing is enabled. */
  suggestedPriceMin: number | null;
  suggestedPriceMax: number | null;
  variantsWithSuggestion: number;
  /** Distinct vendors with stock > 0 on any SKU of this product. */
  vendorCount: number;
  /** Total units listed across all vendor supply lines for this product. */
  vendorStockTotal: number;
}

export interface VariantImage {
  id: string;
  variant_id: string;
  url: string;
  is_preview: boolean;
  sort_order: number;
  created_at: string | null;
}

export interface ProductVariant {
  id: string;
  product_id: string | null;
  name: string | null;
  price: number | null;
  mrp: number | null;
  variant_group_id?: string | null;
  barcode?: string | null;
  product_code?: string | null;
  purchase_price?: number | null;
  tax_rate_percent?: number | null;
  unit_id?: string | null;
  markup_percent?: number | null;
  created_at: string | null;
  /** Ordered images for this variant; preview first. Empty when none. */
  images: VariantImage[];
  /** Central warehouse stock (from inventory). */
  central_stock?: number;
}

export interface ProductImage {
  url: string;
  is_preview: boolean;
  sort_order: number;
}

export interface ProductVideo {
  url: string;
  sort_order: number;
}

export interface VariantGroup {
  id: string;
  name: string;
  sort_order: number;
  product_id?: string;
}

export interface VariantWithProduct extends ProductVariant {
  products: { id: string; name: string | null } | null;
}

export interface InventoryWithVariant {
  variant_id: string;
  store_id?: string | null;
  stock: number | null;
  reserved_stock?: number | null;
  reorder_point: number;
  last_reorder_quantity: number | null;
  updated_at: string | null;
  product_variants: {
    id: string;
    name: string | null;
    products: { id: string; name: string | null } | null;
    variant_images?: { url: string; is_preview: boolean | null }[];
  } | null;
}

/** Admin inventory list summary (server-computed). */
export interface InventoryCatalogStats {
  totalSkus: number;
  /** Stock is null or below 1. */
  criticalSkus: number;
  /** Below per-SKU reorder point but not out of stock. */
  lowStockSkus: number;
  /** At or above per-SKU reorder point. */
  healthySkus: number;
}

export interface VendorProduct {
  id: string;
  vendor_id: string | null;
  variant_id: string | null;
  base_price: number;
  stock: number | null;
  created_at: string | null;
}

export interface VendorProductWithVariant extends VendorProduct {
  product_variants: {
    id: string;
    name: string | null;
    products: { id: string; name: string | null } | null;
  } | null;
}

// ─── Order types ──────────────────────────────────────────────────────────────

export interface OrderUser {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
}

export interface OrderItemPreview {
  id: string;
  product_name: string | null;
  quantity: number | null;
}

export interface Order {
  id: string;
  created_at: string | null;
  status: OrderStatus;
  payment_status: string | null;
  total_amount: number | null;
  merchant_note: string | null;
  customer_edited_at: string | null;
  users: OrderUser | null;
  item_count: number;
  order_items_preview: OrderItemPreview[];
  customer_order_count: number;
  sales_order_number?: string | null;
  reference_number?: string | null;
  shipment_date?: string | null;
  delivery_method?: string | null;
  store_name?: string | null;
  source?: string | null;
  fulfillment_status?: OrderInventoryFulfillmentStatus | null;
  inventory_reserved?: boolean | null;
}

/** Admin orders list summary (server-computed, all orders). */
export interface OrderCatalogStats {
  totalOrders: number;
  pendingCount: number;
  processingCount: number;
  shippedCount: number;
  deliveredCount: number;
  cancelledCount: number;
  itemsOrdered: number;
  ordersFulfilled: number;
  salesReversals: number;
}

export interface OrderItem {
  id: string;
  order_id: string | null;
  product_id?: string | null;
  variant_id: string | null;
  quantity: number | null;
  price: number | null;
  product_name: string | null;
  vendor_id: string | null;
  base_price: number | null;
  final_price: number | null;
  margin_amount: number | null;
  created_at: string | null;
  customer_edit_flag?: string | null;
  tax_rate_percent?: number | null;
  /** Live catalog join when loading order detail (not stored on order_items). */
  variant_meta?: OrderItemVariantMeta | null;
}

export interface OrderItemVariantMeta {
  id: string;
  name: string | null;
  variant_group_id: string | null;
  product: {
    id: string;
    name: string | null;
    image_url: string | null;
    variant_layout?: "flat" | "grouped" | null;
  } | null;
  image_url: string | null;
}

export interface OrderAddress {
  label?: string | null;
  address_line?: string | null;
  line1?: string | null;
  line2?: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  phone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export type OrderInventoryFulfillmentStatus =
  | "none"
  | "pending_assignment"
  | "reserved"
  | "multi_shipment"
  | "partially_shipped"
  | "shipped"
  | "cancelled";

export interface OrderFulfillmentItem {
  id: string;
  variant_id: string;
  product_name: string | null;
  quantity: number;
  reserved_quantity: number;
  shipped_quantity: number;
}

export interface OrderFulfillment {
  id: string;
  status: string;
  store_id: string | null;
  store_name: string | null;
  shipment_number: string | null;
  reserved_at: string | null;
  shipped_at: string | null;
  inventory_committed: boolean;
  items: OrderFulfillmentItem[];
}

export interface FulfillmentQueueRow {
  id: string;
  created_at: string | null;
  status: string;
  fulfillment_status: OrderInventoryFulfillmentStatus;
  total_amount: number | null;
  customer_name: string | null;
  item_count: number;
  fulfillment_count: number;
  pending_assignment_count: number;
}

export interface OrderWithItems {
  id: string;
  created_at: string | null;
  status: string;
  payment_status: string | null;
  total_amount: number | null;
  subtotal?: number | null;
  tax?: number | null;
  discount?: number | null;
  merchant_note: string | null;
  address_id: string | null;
  customer_edited_at: string | null;
  source?: string | null;
  fulfillment_status?: OrderInventoryFulfillmentStatus | null;
  inventory_reserved?: boolean | null;
  inventory_committed?: boolean | null;
  preferred_delivery_date?: string | null;
  shipment_date?: string | null;
  sales_order_number?: string | null;
  reference_number?: string | null;
  delivery_method?: string | null;
  invoice_id?: string | null;
  linked_invoice?: { id: string; status: string } | null;
  tax_inclusive?: boolean | null;
  store_name?: string | null;
  store_id?: string | null;
  users: OrderUser | null;
  addresses: OrderAddress | null;
  order_items: OrderItem[];
  fulfillments?: OrderFulfillment[];
  /** Variant groups keyed by product id (order detail enrichment). */
  variant_groups?: Record<string, VariantGroup[]>;
  customer_order_count: number;
}

// ─── Purchase orders (vendor supply) ──────────────────────────────────────────

export const PURCHASE_ORDER_STATUS_FILTERS = [
  "all",
  "pending",
  "accepted",
  "delivered",
  "cancelled",
] as const;

export type PurchaseOrderStatusFilter =
  (typeof PURCHASE_ORDER_STATUS_FILTERS)[number];

export const PURCHASE_ORDER_DELIVERY_FILTERS = [
  "upcoming",
  "due_this_week",
  "overdue",
  "awaiting_receipt",
] as const;

export type PurchaseOrderDeliveryFilter =
  (typeof PURCHASE_ORDER_DELIVERY_FILTERS)[number];

export interface AdminPurchaseOrderListRow {
  id: string;
  vendor_id: string | null;
  status: string | null;
  total_amount: number | null;
  created_at: string | null;
  po_number?: string | null;
  po_date?: string | null;
  expected_delivery_date?: string | null;
  vendors: { name: string | null } | null;
  stores?: { name: string | null } | null;
}

/** Admin purchase-order list summary (server-computed, all POs). */
export interface PurchaseOrderCatalogStats {
  totalPurchaseOrders: number;
  pendingCount: number;
  acceptedCount: number;
  deliveredCount: number;
  cancelledCount: number;
  dueThisWeekCount: number;
  overdueCount: number;
  awaitingReceiptCount: number;
}

export interface AdminPurchaseOrderItemRow {
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

export interface AdminPurchaseOrderDetail {
  id: string;
  vendor_id: string | null;
  status: string | null;
  total_amount: number | null;
  created_at: string | null;
  vendors: {
    id: string;
    name: string | null;
    contact: string | null;
  } | null;
  purchase_order_items: AdminPurchaseOrderItemRow[];
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export interface DashboardMetrics {
  dailyRevenue: number;
  pendingOrders: number;
  lowStockItems: number;
}

export type DashboardAlertSeverity = "critical" | "warning" | "attention";

/** Sidebar count pill tone (maps to dashboard alert severity). */
export type AdminNavBadgeTone = "critical" | "warning" | "info";

export interface AdminNavBadge {
  count: number;
  tone: AdminNavBadgeTone;
}

export interface AdminNavBadgesPayload {
  badges: Record<string, AdminNavBadge>;
}

export interface DashboardAlert {
  id: string;
  label: string;
  count: number;
  severity: DashboardAlertSeverity;
  href: string;
}

/** Customer order counts by status (DB pipeline). */
export interface OrderPipelineCounts {
  pending: number;
  processing: number;
  shipped: number;
  delivered: number;
}

export interface BusinessMetrics {
  revenueToday: number;
  marginToday: number;
  ordersToday: number;
  averageOrderValue: number;
}

export interface InventoryInsights {
  /** Sum of inventory stock at the active store. */
  availableInventoryUnits: number;
  /** Product / variant rows needing restock (out or low stock). */
  productsNeedingRestock: number;
  /** Units sold today (non-cancelled orders). */
  demandTodayUnits: number;
  outOfStockSkus: number;
  lowStockSkus: number;
}

export interface VendorSnapshotEntry {
  vendorId: string;
  name: string | null;
  /** e.g. fulfillment rate, PO reliability, avg price */
  headline: string;
  value: string;
}

export interface VendorSnapshot {
  topByFulfillment: VendorSnapshotEntry[];
  lowestAvgPrice: VendorSnapshotEntry[];
  topByPoReliability: VendorSnapshotEntry[];
}

/** Distinct catalog products with sellable central stock vs. total products in `products`. */
export interface CatalogInventoryCoverage {
  productsWithStock: number;
  totalProducts: number;
}

export interface DashboardErpInvoiceRow {
  id: string;
  invoice_number: string;
  total_amount: number;
  created_at: string;
  customer_name: string | null;
  status: string;
}

export interface DashboardMonthlySeriesPoint {
  month: string;
  monthNum: number;
  monthKey?: string;
  income: number;
  cogs: number;
  expenses: number;
  netProfit: number;
}

export type DashboardChartGranularity = "day" | "month";

export interface DashboardFulfillmentCounts {
  needsAssignment: number;
  readyToShip: number;
  shipped: number;
  delivered: number;
}

export interface AdminDashboardPayload {
  storeId: string;
  storeName: string;
  periodFrom: string;
  periodTo: string;
  chartGranularity: DashboardChartGranularity;
  metrics: DashboardMetrics;
  alerts: DashboardAlert[];
  pipeline: OrderPipelineCounts;
  business: BusinessMetrics;
  inventory: InventoryInsights;
  catalogCoverage: CatalogInventoryCoverage;
  vendors: VendorSnapshot;
  recentOrders: Order[];
  erpFinancial: import("@/common/erp/finance-types").ErpFinancialDashboard | null;
  erpActivity: import("@/common/erp/types").AuditLogEntry[];
  erpMonthlySeries: DashboardMonthlySeriesPoint[];
  recentErpInvoices: DashboardErpInvoiceRow[];
  erpInvoicesToday: number;
  fulfillmentCounts: DashboardFulfillmentCounts;
}
