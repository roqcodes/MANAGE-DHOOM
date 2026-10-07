/** Central TanStack Query keys for admin API routes. */
export const fixedAssetsListQueryKey = (
  page: number,
  storeId: string,
  search: string,
  activeStoreId?: string,
) => ["admin", "fixed-assets", page, storeId || activeStoreId || "all", search || ""] as const;

export const fixedAssetDetailQueryKey = (id: string) =>
  ["admin", "fixed-asset", id] as const;

export const adminQueryKeys = {
  session: () => ["admin", "session"] as const,
  erpContext: () => ["admin", "erp-context"] as const,
  dashboard: (
    storeId?: string | null,
    dateFrom?: string,
    dateTo?: string,
    granularity?: string,
    section?: string,
  ) =>
    [
      "admin",
      "dashboard",
      storeId ?? "active",
      dateFrom ?? "",
      dateTo ?? "",
      granularity ?? "month",
      section ?? "all",
    ] as const,
  navBadges: () => ["admin", "nav-badges"] as const,
  products: (page: number, categoryId: string | null, storeId?: string | null) =>
    ["admin", "products", page, categoryId ?? "all", storeId ?? "all"] as const,
  vendors: (page: number) => ["admin", "vendors", page] as const,
  inventory: (page: number, storeId?: string | null) =>
    ["admin", "inventory", page, storeId ?? "active"] as const,
  onlineStockTransfers: (storeId?: string | null, status?: string) =>
    ["admin", "online-stock-transfers", storeId ?? "active", status ?? "all"] as const,
  onlineToPhysicalTransfers: (storeId?: string | null) =>
    ["admin", "online-to-physical", storeId ?? "active"] as const,
  orders: (status: string, userId: string | null, page: number) =>
    ["admin", "orders", status, userId ?? "", page] as const,
  salesOrders: (status: string, userId: string | null, page: number, storeId?: string | null) =>
    ["admin", "sales-orders", status, userId ?? "", page, storeId ?? "active"] as const,
  purchaseOrders: (
    status: string,
    delivery: string | null,
    vendorId: string | null,
    page: number,
  ) =>
    ["admin", "purchase-orders", status, delivery ?? "", vendorId ?? "", page] as const,
  users: (tab: string, segment: string, page: number) =>
    ["admin", "users", tab, segment, page] as const,
  delivery: () => ["admin", "delivery"] as const,
  productDetail: (id: string) => ["admin", "product", id] as const,
  productPricingSuggestions: (id: string) => ["admin", "product", id, "pricing-suggestions"] as const,
  orderDetail: (id: string) => ["admin", "order", id] as const,
  vendorDetail: (id: string) => ["admin", "vendor", id] as const,
  purchaseOrderDetail: (id: string) => ["admin", "purchase-order", id] as const,
  customerDetail: (id: string, txPage: number) => ["admin", "customer", id, txPage] as const,
  customersList: (page: number) => ["admin", "customers", "list", page] as const,
  searchIndex: () => ["admin", "search-index"] as const,
  recentActivity: () => ["admin", "recent-activity"] as const,
  taxRates: () => ["admin", "tax-rates"] as const,
  itemUnits: () => ["admin", "item-units"] as const,
  fixedAssets: fixedAssetsListQueryKey,
  fixedAssetDetail: fixedAssetDetailQueryKey,
  appSettings: () => ["admin", "app-settings"] as const,
  pushNotifications: () => ["admin", "push-notifications"] as const,
  analytics: (queryString: string) =>
    ["admin", "analytics", queryString] as const,
  accountsPicker: (storeId?: string | null) =>
    ["admin", "accounts", "picker", storeId ?? "active"] as const,
  erpProductLiveSearch: (
    catalog: "purchase" | "sales",
    storeId: string | undefined,
    query: string,
  ) => ["admin", "erp-product-search", catalog, storeId ?? "", query] as const,
  entityLiveSearch: (scope: string, query: string) =>
    ["admin", "entity-search", scope, query] as const,
  /** Full admin GET path including query string — must match the page request. */
  erpGet: (pathAndQuery: string) => ["admin", "get", pathAndQuery] as const,
};
