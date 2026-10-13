import type {
  InventoryCatalogStats,
  OrderCatalogStats,
  ProductCatalogStats,
  PurchaseOrderCatalogStats,
  VendorCatalogStats,
} from "@/common/admin/types";
import type { CustomerStats } from "@/modules/customers/services/customers.service";
import type { TeamCatalogStats } from "@/modules/users/services/users.service";

export const EMPTY_CUSTOMER_STATS: CustomerStats = {
  total: 0,
  retail: 0,
  staff: 0,
  active: 0,
};

export const EMPTY_ORDER_CATALOG_STATS: OrderCatalogStats = {
  totalOrders: 0,
  pendingCount: 0,
  processingCount: 0,
  shippedCount: 0,
  deliveredCount: 0,
  cancelledCount: 0,
  itemsOrdered: 0,
  ordersFulfilled: 0,
  salesReversals: 0,
};

export const EMPTY_PRODUCT_CATALOG_STATS: ProductCatalogStats = {
  total: 0,
  active: 0,
  inactive: 0,
  categoriesCount: 0,
  uncategorized: 0,
  categoryCounts: {},
  outOfStock: 0,
  inventoryValue: 0,
};

export const EMPTY_VENDOR_CATALOG_STATS: VendorCatalogStats = {
  total: 0,
  active: 0,
  inactive: 0,
  supplyLines: 0,
};

export const EMPTY_PURCHASE_ORDER_CATALOG_STATS: PurchaseOrderCatalogStats = {
  totalPurchaseOrders: 0,
  pendingCount: 0,
  acceptedCount: 0,
  deliveredCount: 0,
  cancelledCount: 0,
  dueThisWeekCount: 0,
  overdueCount: 0,
  awaitingReceiptCount: 0,
};

export const EMPTY_INVENTORY_CATALOG_STATS: InventoryCatalogStats = {
  totalSkus: 0,
  criticalSkus: 0,
  lowStockSkus: 0,
  healthySkus: 0,
};

export const EMPTY_TEAM_CATALOG_STATS: TeamCatalogStats = {
  vendor: 0,
  delivery: 0,
  admin: 0,
  manager: 0,
  erpStaff: 0,
  pendingRequests: 0,
};
