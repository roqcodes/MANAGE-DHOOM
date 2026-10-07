import "server-only";

import {
  differenceInCalendarDays,
  endOfDay,
  format,
  startOfDay,
  subDays,
} from "date-fns";

import type {
  AnalyticsActionType,
  AnalyticsFilters,
  AnalyticsPayload,
  ChartDataPoint,
  CustomerActivityRow,
  FunnelStage,
  ProductReachCustomer,
  ProductReachDetail,
} from "@/common/analytics/types";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type { Json } from "@/lib/integrations/supabase/types";

const COMPLETED_STATUSES = new Set(["delivered", "shipped", "processing"]);

function parseReachCustomers(raw: Json | null | undefined): ProductReachCustomer[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const row = item as Record<string, unknown>;
      const customerId = String(row.customerId ?? "");
      if (!customerId) return null;
      return {
        customerId,
        customerName: String(row.customerName ?? "Customer"),
        phone: row.phone == null ? null : String(row.phone),
        at: String(row.at ?? new Date().toISOString()),
        quantity:
          row.quantity == null || row.quantity === ""
            ? undefined
            : Number(row.quantity),
        value:
          row.value == null || row.value === "" ? undefined : Number(row.value),
      } satisfies ProductReachCustomer;
    })
    .filter(Boolean) as ProductReachCustomer[];
}

type OrderRow = {
  id: string;
  user_id: string | null;
  total_amount: number | null;
  status: string;
  created_at: string | null;
  customer_name: string | null;
  phone: string | null;
};

type OrderItemRow = {
  id: string;
  order_id: string | null;
  variant_id: string | null;
  quantity: number | null;
  final_price: number | null;
  price: number | null;
  product_name: string | null;
  created_at: string | null;
};

type ViewReachRow = {
  user_id: string;
  product_id: string;
  variant_id: string | null;
  first_seen_at: string;
};

type CartReachRow = {
  user_id: string;
  variant_id: string;
  product_id: string | null;
  quantity: number;
  value_amount: number;
  first_carted_at: string;
};

type VariantMeta = {
  id: string;
  name: string | null;
  price: number | null;
  product_id: string | null;
  products: {
    id: string;
    name: string | null;
    category_id: string | null;
  } | null;
};

type UserMeta = {
  id: string;
  name: string | null;
  phone: string | null;
};

type AddressMeta = {
  user_id: string;
  state: string;
};

function parseDateRange(from: string, to: string) {
  const fromDate = startOfDay(new Date(from));
  const toDate = endOfDay(new Date(to));
  const days = Math.max(1, differenceInCalendarDays(toDate, fromDate) + 1);
  const prevTo = endOfDay(subDays(fromDate, 1));
  const prevFrom = startOfDay(subDays(fromDate, days));
  return { fromDate, toDate, prevFrom, prevTo, days };
}

function inRange(iso: string | null | undefined, from: Date, to: Date) {
  if (!iso) return false;
  const d = new Date(iso);
  return d >= from && d <= to;
}

function tierFromRevenue(revenue: number): string {
  if (revenue >= 500_000) return "platinum";
  if (revenue >= 100_000) return "gold";
  if (revenue >= 25_000) return "silver";
  return "standard";
}

function tierLabel(tier: string): string {
  const labels: Record<string, string> = {
    platinum: "Platinum",
    gold: "Gold",
    silver: "Silver",
    standard: "Standard",
    all: "All tiers",
  };
  return labels[tier] ?? tier;
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function buildFunnel(
  views: number,
  carts: number,
  checkouts: number,
  completed: number,
): FunnelStage[] {
  const stages = [
    { key: "views", label: "Product reach", count: views },
    { key: "cart", label: "Carted (reach)", count: carts },
    { key: "checkout", label: "Checkout (reach)", count: checkouts },
    { key: "orders", label: "Purchased (reach)", count: completed },
  ];
  return stages.map((stage, i) => {
    const prev = i > 0 ? stages[i - 1].count : null;
    const dropOffPct =
      prev != null && prev > 0
        ? Math.round(((prev - stage.count) / prev) * 1000) / 10
        : null;
    return { ...stage, dropOffPct };
  });
}

function aggregateChartByDate(
  orders: OrderRow[],
  from: Date,
  to: Date,
  weekly: boolean,
): ChartDataPoint[] {
  const buckets = new Map<string, number>();
  const cursor = new Date(from);
  while (cursor <= to) {
    const key = weekly
      ? format(cursor, "yyyy-'W'ww")
      : format(cursor, "yyyy-MM-dd");
    buckets.set(key, 0);
    cursor.setDate(cursor.getDate() + (weekly ? 7 : 1));
  }
  for (const o of orders) {
    if (!o.created_at || !COMPLETED_STATUSES.has(o.status)) continue;
    const d = new Date(o.created_at);
    const key = weekly
      ? format(d, "yyyy-'W'ww")
      : format(d, "yyyy-MM-dd");
    if (buckets.has(key)) {
      buckets.set(key, (buckets.get(key) ?? 0) + Number(o.total_amount ?? 0));
    }
  }
  return Array.from(buckets.entries()).map(([label, value]) => ({ label, value }));
}

export async function getAnalyticsPayload(
  filters: AnalyticsFilters,
  chartAxis?: { x?: string; y?: string },
): Promise<AnalyticsPayload> {
  const supabase = await createSupabaseServerClient();
  const { fromDate, toDate, prevFrom, prevTo } = parseDateRange(
    filters.from,
    filters.to,
  );

  const productFilter =
    filters.productId && filters.productId !== "all" ? filters.productId : undefined;

  const fromIso = fromDate.toISOString();
  const toIso = toDate.toISOString();

  let viewReachQuery = supabase
    .from("product_view_reach")
    .select("user_id, product_id, variant_id, first_seen_at")
    .gte("first_seen_at", fromIso)
    .lte("first_seen_at", toIso)
    .order("first_seen_at", { ascending: false })
    .limit(150);

  let cartReachQuery = supabase
    .from("cart_reach")
    .select("user_id, variant_id, product_id, quantity, value_amount, first_carted_at")
    .gte("first_carted_at", fromIso)
    .lte("first_carted_at", toIso)
    .order("first_carted_at", { ascending: false })
    .limit(150);

  if (productFilter) {
    viewReachQuery = viewReachQuery.eq("product_id", productFilter);
    cartReachQuery = cartReachQuery.eq("product_id", productFilter);
  }

  const [
    categoriesRes,
    productsRes,
    variantsRes,
    ordersRes,
    orderItemsRes,
    usersRes,
    addressesRes,
    funnelRes,
    viewReachRes,
    cartReachRes,
    productDetailRes,
  ] = await Promise.all([
    supabase.from("categories").select("id, name").order("name"),
    supabase.from("products").select("id, name, category_id").order("name"),
    supabase
      .from("product_variants")
      .select("id, name, price, product_id, products(id, name, category_id)"),
    supabase
      .from("orders")
      .select("id, user_id, total_amount, status, created_at, customer_name, phone")
      .gte("created_at", prevFrom.toISOString())
      .lte("created_at", toDate.toISOString()),
    supabase
      .from("order_items")
      .select("id, order_id, variant_id, quantity, final_price, price, product_name, created_at"),
    supabase.from("users").select("id, name, phone").is("role", null),
    supabase.from("addresses").select("user_id, state"),
    supabase.rpc("analytics_funnel_reach", {
      p_from: fromIso,
      p_to: toIso,
      p_product_id: productFilter,
    }),
    viewReachQuery,
    cartReachQuery,
    supabase.rpc("analytics_product_reach_detail", {
      p_from: fromIso,
      p_to: toIso,
      p_product_id: productFilter,
      p_limit: 50,
    }),
  ]);

  const categories = categoriesRes.data ?? [];
  const products = productsRes.data ?? [];
  const variants = (variantsRes.data ?? []) as VariantMeta[];
  const allOrders = (ordersRes.data ?? []) as OrderRow[];
  const orderItems = (orderItemsRes.data ?? []) as OrderItemRow[];
  const users = (usersRes.data ?? []) as UserMeta[];
  const addresses = (addressesRes.data ?? []) as AddressMeta[];
  const viewReachRows = (viewReachRes.data ?? []) as ViewReachRow[];
  const cartReachRows = (cartReachRes.data ?? []) as CartReachRow[];
  const funnelRow = Array.isArray(funnelRes.data)
    ? funnelRes.data[0]
    : funnelRes.data;

  const productDetails: ProductReachDetail[] = (productDetailRes.data ?? []).map(
    (row) => ({
      productId: row.product_id,
      productName: row.product_name,
      viewCount: Number(row.view_count ?? 0),
      cartCount: Number(row.cart_count ?? 0),
      orderCount: Number(row.order_count ?? 0),
      unitsSold: Number(row.units_sold ?? 0),
      revenue: Number(row.revenue ?? 0),
      viewers: parseReachCustomers(row.viewers),
      carters: parseReachCustomers(row.carters),
      buyers: parseReachCustomers(row.buyers),
    }),
  );

  const variantMap = new Map(variants.map((v) => [v.id, v]));
  const productMap = new Map(products.map((p) => [p.id, p]));
  const userMap = new Map(users.map((u) => [u.id, u]));
  const userRegion = new Map<string, string>();
  for (const a of addresses) {
    if (!userRegion.has(a.user_id)) userRegion.set(a.user_id, a.state);
  }

  const userLifetimeRevenue = new Map<string, number>();
  for (const o of allOrders) {
    if (!o.user_id || !COMPLETED_STATUSES.has(o.status)) continue;
    userLifetimeRevenue.set(
      o.user_id,
      (userLifetimeRevenue.get(o.user_id) ?? 0) + Number(o.total_amount ?? 0),
    );
  }

  const categoryFilter = filters.category && filters.category !== "all" ? filters.category : null;
  const tierFilter = filters.tier && filters.tier !== "all" ? filters.tier : null;
  const regionFilter = filters.region && filters.region !== "all" ? filters.region : null;

  function matchesProductFilters(variantId: string | null): boolean {
    if (!variantId) return !productFilter && !categoryFilter;
    const v = variantMap.get(variantId);
    const pid = v?.product_id ?? v?.products?.id;
    if (productFilter && pid !== productFilter) return false;
    const cat = v?.products?.category_id ?? (pid ? productMap.get(pid)?.category_id : null);
    if (categoryFilter && cat !== categoryFilter) return false;
    return true;
  }

  function matchesUserFilters(userId: string | null): boolean {
    if (!userId) return !tierFilter && !regionFilter;
    if (tierFilter) {
      const rev = userLifetimeRevenue.get(userId) ?? 0;
      if (tierFromRevenue(rev) !== tierFilter) return false;
    }
    if (regionFilter) {
      const region = userRegion.get(userId);
      if (region !== regionFilter) return false;
    }
    return true;
  }

  const periodOrdersRaw = allOrders.filter(
    (o) => inRange(o.created_at, fromDate, toDate) && matchesUserFilters(o.user_id),
  );
  const prevOrdersRaw = allOrders.filter(
    (o) => inRange(o.created_at, prevFrom, prevTo) && matchesUserFilters(o.user_id),
  );

  function orderMatchesProduct(orderId: string): boolean {
    if (!productFilter && !categoryFilter) return true;
    return orderItems.some(
      (oi) => oi.order_id === orderId && matchesProductFilters(oi.variant_id),
    );
  }

  const periodOrders = periodOrdersRaw.filter((o) => orderMatchesProduct(o.id));
  const prevOrders = prevOrdersRaw.filter((o) => orderMatchesProduct(o.id));

  const completedOrders = periodOrders.filter((o) => COMPLETED_STATUSES.has(o.status));
  const prevCompleted = prevOrders.filter((o) => COMPLETED_STATUSES.has(o.status));

  const totalRevenue = (() => {
    if (!productFilter && !categoryFilter) {
      return completedOrders.reduce((s, o) => s + Number(o.total_amount ?? 0), 0);
    }
    return orderItems
      .filter(
        (oi) =>
          oi.order_id &&
          completedOrders.some((o) => o.id === oi.order_id) &&
          matchesProductFilters(oi.variant_id),
      )
      .reduce(
        (s, oi) =>
          s + Number(oi.final_price ?? oi.price ?? 0) * Number(oi.quantity ?? 1),
        0,
      );
  })();
  const prevRevenue = (() => {
    if (!productFilter && !categoryFilter) {
      return prevCompleted.reduce((s, o) => s + Number(o.total_amount ?? 0), 0);
    }
    return orderItems
      .filter(
        (oi) =>
          oi.order_id &&
          prevCompleted.some((o) => o.id === oi.order_id) &&
          matchesProductFilters(oi.variant_id),
      )
      .reduce(
        (s, oi) =>
          s + Number(oi.final_price ?? oi.price ?? 0) * Number(oi.quantity ?? 1),
        0,
      );
  })();

  const orderIds = new Set(periodOrders.map((o) => o.id));

  const viewReach = Number(funnelRow?.view_reach ?? 0);
  const cartReach = Number(funnelRow?.cart_reach ?? 0);
  const checkoutReach = Number(funnelRow?.checkout_reach ?? 0);
  const purchaseReach = Number(funnelRow?.purchase_reach ?? 0);

  const completedUsers = new Set(
    completedOrders.map((o) => o.user_id).filter(Boolean) as string[],
  );
  const cartUsers = new Set(cartReachRows.map((r) => r.user_id));

  const funnel = buildFunnel(
    viewReach || Math.max(cartReach, purchaseReach),
    cartReach || cartUsers.size,
    checkoutReach ||
      new Set(periodOrders.map((o) => o.user_id).filter(Boolean) as string[])
        .size,
    purchaseReach || completedUsers.size,
  );

  const cartedReach = cartReach || cartUsers.size;
  const abandonedCustomerReach = [...cartUsers].filter(
    (uid) => !completedUsers.has(uid),
  ).length;

  const cartAbandonmentRate =
    cartedReach > 0
      ? Math.round((abandonedCustomerReach / cartedReach) * 1000) / 10
      : 0;

  const effectiveViewReach = viewReach || Math.max(cartReach, purchaseReach);
  const funnelConversionRate =
    effectiveViewReach > 0
      ? Math.round(
          ((purchaseReach || completedUsers.size) / effectiveViewReach) * 1000,
        ) / 10
      : 0;

  const totalOrders = completedOrders.length;
  const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const activities: CustomerActivityRow[] = [];

  for (const o of periodOrders) {
    const items = orderItems.filter((oi) => oi.order_id === o.id);
    for (const oi of items) {
      if (!matchesProductFilters(oi.variant_id)) continue;
      const v = oi.variant_id ? variantMap.get(oi.variant_id) : null;
      const user = o.user_id ? userMap.get(o.user_id) : null;
      const qty = Number(oi.quantity ?? 1);
      const unit = Number(oi.final_price ?? oi.price ?? 0);
      activities.push({
        id: `order-${oi.id}`,
        customerId: o.user_id,
        customerName: o.customer_name ?? user?.name ?? "Guest",
        phone: o.phone ?? user?.phone ?? null,
        actionType: "placed_order",
        productName: oi.product_name ?? v?.products?.name ?? v?.name ?? "Product",
        sku: v?.name ?? null,
        quantity: qty,
        value: unit * qty,
        timestamp: o.created_at ?? oi.created_at ?? new Date().toISOString(),
      });
    }
  }

  for (const row of cartReachRows) {
    if (!matchesUserFilters(row.user_id)) continue;
    if (categoryFilter) {
      const cat = row.product_id
        ? productMap.get(row.product_id)?.category_id
        : null;
      if (cat !== categoryFilter) continue;
    }
    const user = userMap.get(row.user_id);
    const v = variantMap.get(row.variant_id);
    const actionType: AnalyticsActionType = completedUsers.has(row.user_id)
      ? "added_to_cart"
      : "abandoned_cart";
    activities.push({
      id: `cart-${row.user_id}-${row.variant_id}`,
      customerId: row.user_id,
      customerName: user?.name ?? "Guest",
      phone: user?.phone ?? null,
      actionType,
      productName:
        (row.product_id ? productMap.get(row.product_id)?.name : null) ??
        v?.products?.name ??
        v?.name ??
        "Product",
      sku: v?.name ?? null,
      quantity: row.quantity,
      value: Number(row.value_amount ?? 0),
      timestamp: row.first_carted_at,
    });
  }

  for (const row of viewReachRows) {
    if (!matchesUserFilters(row.user_id)) continue;
    if (categoryFilter) {
      const cat = productMap.get(row.product_id)?.category_id;
      if (cat !== categoryFilter) continue;
    }
    const user = userMap.get(row.user_id);
    const v = row.variant_id ? variantMap.get(row.variant_id) : null;
    const p = productMap.get(row.product_id);
    activities.push({
      id: `view-${row.user_id}-${row.product_id}`,
      customerId: row.user_id,
      customerName: user?.name ?? "Guest",
      phone: user?.phone ?? null,
      actionType: "viewed_product",
      productName: p?.name ?? v?.products?.name ?? v?.name ?? "Product",
      sku: v?.name ?? null,
      quantity: 0,
      value: 0,
      timestamp: row.first_seen_at,
    });
  }

  activities.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  const xAxis = chartAxis?.x ?? "date_daily";
  let chartSeries: ChartDataPoint[] = [];

  if (xAxis === "date_daily" || xAxis === "date_weekly") {
    chartSeries = aggregateChartByDate(
      completedOrders,
      fromDate,
      toDate,
      xAxis === "date_weekly",
    );
  } else if (xAxis === "category") {
    const bucket = new Map<string, number>();
    for (const oi of orderItems) {
      if (!oi.order_id || !orderIds.has(oi.order_id)) continue;
      if (!matchesProductFilters(oi.variant_id)) continue;
      const v = oi.variant_id ? variantMap.get(oi.variant_id) : null;
      const catId = v?.products?.category_id;
      const catName =
        categories.find((c) => c.id === catId)?.name ?? "Uncategorized";
      const val = Number(oi.final_price ?? oi.price ?? 0) * Number(oi.quantity ?? 1);
      bucket.set(catName, (bucket.get(catName) ?? 0) + val);
    }
    chartSeries = Array.from(bucket.entries()).map(([label, value]) => ({
      label,
      value,
    }));
  } else if (xAxis === "tier") {
    const bucket = new Map<string, number>();
    for (const o of completedOrders) {
      if (!o.user_id) continue;
      const rev = userLifetimeRevenue.get(o.user_id) ?? 0;
      const label = tierLabel(tierFromRevenue(rev));
      bucket.set(label, (bucket.get(label) ?? 0) + Number(o.total_amount ?? 0));
    }
    chartSeries = Array.from(bucket.entries()).map(([label, value]) => ({
      label,
      value,
    }));
  } else if (xAxis === "payment_method") {
    const bucket = new Map<string, number>();
    for (const o of completedOrders) {
      bucket.set("COD / Invoice", (bucket.get("COD / Invoice") ?? 0) + Number(o.total_amount ?? 0));
    }
    chartSeries = Array.from(bucket.entries()).map(([label, value]) => ({
      label,
      value,
    }));
  } else if (xAxis === "delivery_route") {
    const bucket = new Map<string, number>();
    for (const o of completedOrders) {
      const region = o.user_id ? userRegion.get(o.user_id) ?? "Unassigned" : "Walk-in";
      bucket.set(region, (bucket.get(region) ?? 0) + Number(o.total_amount ?? 0));
    }
    chartSeries = Array.from(bucket.entries()).map(([label, value]) => ({
      label,
      value,
    }));
  }

  const yAxis = chartAxis?.y ?? "revenue";
  if (yAxis === "order_count") {
    if (xAxis === "date_daily" || xAxis === "date_weekly") {
      const weekly = xAxis === "date_weekly";
      const buckets = new Map<string, number>();
      const cursor = new Date(fromDate);
      while (cursor <= toDate) {
        buckets.set(
          weekly ? format(cursor, "yyyy-'W'ww") : format(cursor, "yyyy-MM-dd"),
          0,
        );
        cursor.setDate(cursor.getDate() + (weekly ? 7 : 1));
      }
      for (const o of completedOrders) {
        if (!o.created_at) continue;
        const key = weekly
          ? format(new Date(o.created_at), "yyyy-'W'ww")
          : format(new Date(o.created_at), "yyyy-MM-dd");
        if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
      }
      chartSeries = Array.from(buckets.entries()).map(([label, value]) => ({
        label,
        value,
      }));
    } else {
      chartSeries = chartSeries.map((p) => ({
        ...p,
        value: Math.max(1, Math.round(p.value / Math.max(averageOrderValue, 1))),
      }));
    }
  }

  const regions = Array.from(new Set(addresses.map((a) => a.state))).sort();

  return {
    kpis: {
      totalRevenue,
      revenueChangePct: Math.round(pctChange(totalRevenue, prevRevenue) * 10) / 10,
      totalOrders,
      averageOrderValue: Math.round(averageOrderValue * 100) / 100,
      funnelConversionRate,
      cartAbandonmentRate,
    },
    funnel,
    chartSeries,
    activities: activities.slice(0, 200),
    productDetails,
    filterOptions: {
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name ?? "Category",
      })),
      tiers: [
        { id: "platinum", name: "Platinum" },
        { id: "gold", name: "Gold" },
        { id: "silver", name: "Silver" },
        { id: "standard", name: "Standard" },
      ],
      regions: regions.map((r) => ({ id: r, name: r })),
      products: products.map((p) => ({
        id: p.id,
        name: p.name ?? "Product",
        sku: null,
      })),
    },
  };
}
