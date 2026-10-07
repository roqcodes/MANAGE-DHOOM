export type AnalyticsActionType =
  | "viewed_product"
  | "added_to_cart"
  | "placed_order"
  | "abandoned_cart";

export type AnalyticsFilters = {
  from: string;
  to: string;
  category?: string | null;
  tier?: string | null;
  region?: string | null;
  productId?: string | null;
};

export type AnalyticsKpis = {
  totalRevenue: number;
  revenueChangePct: number;
  totalOrders: number;
  averageOrderValue: number;
  funnelConversionRate: number;
  cartAbandonmentRate: number;
};

export type FunnelStage = {
  key: string;
  label: string;
  count: number;
  dropOffPct: number | null;
};

export type ChartDataPoint = {
  label: string;
  value: number;
};

export type CustomerActivityRow = {
  id: string;
  customerId: string | null;
  customerName: string;
  phone: string | null;
  actionType: AnalyticsActionType;
  productName: string;
  sku: string | null;
  quantity: number;
  value: number;
  timestamp: string;
};

export type AnalyticsProductOption = {
  id: string;
  name: string;
  sku: string | null;
};

export type ProductReachCustomer = {
  customerId: string;
  customerName: string;
  phone: string | null;
  at: string;
  quantity?: number;
  value?: number;
};

export type ProductReachDetail = {
  productId: string;
  productName: string;
  viewCount: number;
  cartCount: number;
  orderCount: number;
  unitsSold: number;
  revenue: number;
  viewers: ProductReachCustomer[];
  carters: ProductReachCustomer[];
  buyers: ProductReachCustomer[];
};

export type AnalyticsFilterOptions = {
  categories: { id: string; name: string }[];
  tiers: { id: string; name: string }[];
  regions: { id: string; name: string }[];
  products: AnalyticsProductOption[];
};

export type AnalyticsPayload = {
  kpis: AnalyticsKpis;
  funnel: FunnelStage[];
  chartSeries: ChartDataPoint[];
  activities: CustomerActivityRow[];
  productDetails: ProductReachDetail[];
  filterOptions: AnalyticsFilterOptions;
};
