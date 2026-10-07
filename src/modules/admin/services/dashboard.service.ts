import "server-only";

import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { invokeRpc } from "@/lib/integrations/supabase/rpc";
import type {
  AdminDashboardPayload,
  CatalogInventoryCoverage,
  DashboardAlert,
  DashboardChartGranularity,
  DashboardErpInvoiceRow,
  DashboardFulfillmentCounts,
  DashboardMonthlySeriesPoint,
  InventoryInsights,
  Order,
} from "@/common/admin/types";
import { listAuditLogs } from "@/modules/erp/services/audit-log.service";
import {
  buildStorePlSeries,
  getStoreFinancialDashboard,
} from "@/modules/erp/services/erp-finance-dashboard.service";
import { requireErpStoreId } from "@/modules/erp/services/store-context.service";
import type { ErpFinancialDashboard } from "@/common/erp/finance-types";
import type { AuditLogEntry } from "@/common/erp/types";

export type DashboardPayloadSection = "core" | "extended" | "all";

function sortAlertsBySeverity(alerts: DashboardAlert[]): DashboardAlert[] {
  const rank: Record<string, number> = { critical: 0, warning: 1, attention: 2 };
  return [...alerts].sort(
    (a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9),
  );
}

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function emptySeries(): DashboardMonthlySeriesPoint[] {
  return MONTH_LABELS.map((month, i) => ({
    month,
    monthNum: i + 1,
    income: 0,
    cogs: 0,
    expenses: 0,
    netProfit: 0,
  }));
}

type OpsSnapshot = {
  store_name?: string;
  daily_revenue?: number;
  orders_today?: number;
  pending?: number;
  processing?: number;
  shipped?: number;
  delivered?: number;
  unfulfilled?: number;
  delayed?: number;
  needs_assignment?: number;
  ready_to_ship?: number;
  invoices_today?: number;
  available_units?: number;
  out_of_stock?: number;
  low_stock?: number;
  margin_today?: number;
  demand_today?: number;
};

async function loadInvoiceCustomerNames(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userIds: string[],
): Promise<Map<string, string | null>> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const nameById = new Map<string, string | null>();
  if (uniqueIds.length === 0) return nameById;

  const { data, error } = await supabase
    .from("users")
    .select("id, name")
    .in("id", uniqueIds);
  if (error) return nameById;

  for (const user of data ?? []) {
    nameById.set(user.id, user.name);
  }
  return nameById;
}

function emptyVendors(): AdminDashboardPayload["vendors"] {
  return {
    topByFulfillment: [],
    lowestAvgPrice: [],
    topByPoReliability: [],
  };
}

const emptyCoverage: CatalogInventoryCoverage = {
  productsWithStock: 0,
  totalProducts: 0,
};

function buildCoreFromOps(
  activeStoreId: string,
  periodFrom: string,
  periodTo: string,
  granularity: DashboardChartGranularity,
  ops: OpsSnapshot,
  recentOrders: Order[],
): AdminDashboardPayload {
  const dailyRevenue = Number(ops.daily_revenue ?? 0);
  const ordersToday = Number(ops.orders_today ?? 0);
  const pending = Number(ops.pending ?? 0);
  const outOfStockCount = Number(ops.out_of_stock ?? 0);
  const lowStockItems = Number(ops.low_stock ?? 0);
  const delayed = Number(ops.delayed ?? 0);
  const unfulfilled = Number(ops.unfulfilled ?? 0);
  const delivered = Number(ops.delivered ?? 0);

  const inventory: InventoryInsights = {
    availableInventoryUnits: Number(ops.available_units ?? 0),
    productsNeedingRestock: outOfStockCount + lowStockItems,
    demandTodayUnits: Number(ops.demand_today ?? 0),
    outOfStockSkus: outOfStockCount,
    lowStockSkus: lowStockItems,
  };

  const pipeline = {
    pending,
    processing: Number(ops.processing ?? 0),
    shipped: Number(ops.shipped ?? 0),
    delivered,
  };

  const fulfillmentCounts: DashboardFulfillmentCounts = {
    needsAssignment: Number(ops.needs_assignment ?? 0),
    readyToShip: Number(ops.ready_to_ship ?? 0),
    shipped: Number(ops.shipped ?? 0),
    delivered,
  };

  const alerts: DashboardAlert[] = sortAlertsBySeverity([
    {
      id: "out-of-stock",
      label: "Out of stock SKUs",
      count: outOfStockCount,
      severity: "critical",
      href: "/admin/inventory",
    },
    {
      id: "delayed",
      label: "Delayed orders (open from prior days)",
      count: delayed,
      severity: "critical",
      href: "/admin/orders",
    },
    {
      id: "low-stock",
      label: "Low stock SKUs",
      count: lowStockItems,
      severity: "warning",
      href: "/admin/inventory",
    },
    {
      id: "unfulfilled",
      label: "Unfulfilled orders (in flight)",
      count: unfulfilled,
      severity: "attention",
      href: "/admin/orders",
    },
  ]);

  return {
    storeId: activeStoreId,
    storeName: ops.store_name ?? "Store",
    periodFrom,
    periodTo,
    chartGranularity: granularity,
    metrics: {
      dailyRevenue,
      pendingOrders: pending,
      lowStockItems,
    },
    alerts,
    pipeline,
    business: {
      revenueToday: dailyRevenue,
      marginToday: Number(ops.margin_today ?? 0),
      ordersToday,
      averageOrderValue: ordersToday > 0 ? dailyRevenue / ordersToday : 0,
    },
    inventory,
    catalogCoverage: emptyCoverage,
    vendors: emptyVendors(),
    recentOrders,
    erpFinancial: null,
    erpActivity: [],
    erpMonthlySeries: emptySeries(),
    recentErpInvoices: [],
    erpInvoicesToday: Number(ops.invoices_today ?? 0),
    fulfillmentCounts,
  };
}

/** Store-scoped dashboard. `core` skips P&L/audit; `extended` fills financial sections. */
export async function getAdminDashboardPayload(
  storeId?: string | null,
  dateFrom?: string | null,
  dateTo?: string | null,
  granularity: DashboardChartGranularity = "month",
  section: DashboardPayloadSection = "all",
): Promise<AdminDashboardPayload> {
  const supabase = await createSupabaseServerClient();
  const activeStoreId = await requireErpStoreId(storeId);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const year = today.getFullYear();
  const periodFrom = dateFrom?.trim() || `${year}-01-01`;
  const periodTo = dateTo?.trim() || today.toISOString().slice(0, 10);
  const startOfDay = today.toISOString();

  const wantCore = section === "core" || section === "all";
  const wantExtended = section === "extended" || section === "all";

  const opsPromise = wantCore
    ? invokeRpc(supabase, "get_admin_store_ops_snapshot", {
        p_store_id: activeStoreId,
        p_start_of_day: startOfDay,
      })
    : Promise.resolve({ data: null, error: null });

  const recentPromise = wantCore
    ? supabase
        .from("orders")
        .select(
          "id,created_at,status,total_amount,fulfillment_status,source,users:users!orders_user_fkey(name,phone)",
        )
        .eq("store_id", activeStoreId)
        .order("created_at", { ascending: false })
        .limit(8)
    : Promise.resolve({ data: [] });

  const extendedPromise = wantExtended
    ? Promise.all([
        getStoreFinancialDashboard(activeStoreId, periodFrom, periodTo),
        listAuditLogs({ storeId: activeStoreId, limit: 15, skipCount: true }),
        buildStorePlSeries(activeStoreId, periodFrom, periodTo, granularity),
      ]).catch(() => null)
    : Promise.resolve(null);

  const [opsResult, recentResult, extendedResult] = await Promise.all([
    opsPromise,
    recentPromise,
    extendedPromise,
  ]);

  let ops = ((opsResult as { data?: OpsSnapshot | null }).data ?? {}) as OpsSnapshot;
  if (wantCore && ("error" in opsResult && opsResult.error || !opsResult.data)) {
    const [
      storeRow,
      todayOrders,
      pendingPipe,
      processingPipe,
      shippedPipe,
      deliveredPipe,
      unfulfilledResult,
      delayedResult,
      fulfillPending,
      fulfillReady,
      inventoryStockRows,
      invoicesToday,
    ] = await Promise.all([
      supabase.from("stores").select("name").eq("id", activeStoreId).maybeSingle(),
      supabase
        .from("orders")
        .select("id,total_amount")
        .eq("store_id", activeStoreId)
        .gte("created_at", startOfDay)
        .neq("status", "cancelled"),
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("store_id", activeStoreId)
        .eq("status", "pending"),
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("store_id", activeStoreId)
        .eq("status", "processing"),
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("store_id", activeStoreId)
        .eq("status", "shipped"),
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("store_id", activeStoreId)
        .eq("status", "delivered"),
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("store_id", activeStoreId)
        .in("status", ["pending", "processing", "shipped"]),
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("store_id", activeStoreId)
        .in("status", ["pending", "processing", "shipped"])
        .lt("created_at", startOfDay),
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("store_id", activeStoreId)
        .eq("fulfillment_status", "pending_assignment")
        .not("status", "eq", "cancelled"),
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("store_id", activeStoreId)
        .in("fulfillment_status", ["reserved", "multi_shipment", "partially_shipped"])
        .not("status", "eq", "cancelled"),
      supabase
        .from("store_product_inventory")
        .select("stock")
        .eq("store_id", activeStoreId),
      supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("store_id", activeStoreId)
        .gte("created_at", startOfDay)
        .in("status", ["issued", "partial", "paid"]),
    ]);
    const todayIds = (todayOrders.data ?? []).map((row) => row.id as string);
    const [marginResult, demandResult] = await Promise.all([
      todayIds.length === 0
        ? Promise.resolve({ data: [] as { margin_amount: number | null }[] })
        : supabase.from("order_items").select("margin_amount").in("order_id", todayIds),
      todayIds.length === 0
        ? Promise.resolve({ data: [] as { quantity: number | null }[] })
        : supabase.from("order_items").select("quantity").in("order_id", todayIds),
    ]);
    const stockRows = inventoryStockRows.data ?? [];
    let outOfStockCount = 0;
    let lowStockItems = 0;
    let availableUnits = 0;
    for (const row of stockRows) {
      const stock = Math.max(0, Math.floor(Number(row.stock ?? 0)));
      availableUnits += stock;
      if (stock < 1) outOfStockCount += 1;
      else if (stock < 10) lowStockItems += 1;
    }
    ops = {
      store_name: storeRow.data?.name ?? "Store",
      daily_revenue: (todayOrders.data ?? []).reduce(
        (sum, row) => sum + Number(row.total_amount ?? 0),
        0,
      ),
      orders_today: todayOrders.data?.length ?? 0,
      pending: pendingPipe.count ?? 0,
      processing: processingPipe.count ?? 0,
      shipped: shippedPipe.count ?? 0,
      delivered: deliveredPipe.count ?? 0,
      unfulfilled: unfulfilledResult.count ?? 0,
      delayed: delayedResult.count ?? 0,
      needs_assignment: fulfillPending.count ?? 0,
      ready_to_ship: fulfillReady.count ?? 0,
      invoices_today: invoicesToday.count ?? 0,
      available_units: availableUnits,
      out_of_stock: outOfStockCount,
      low_stock: lowStockItems,
      margin_today: (marginResult.data ?? []).reduce(
        (sum, row) => sum + Number(row.margin_amount ?? 0),
        0,
      ),
      demand_today: (demandResult.data ?? []).reduce(
        (sum, row) => sum + Math.max(0, Math.floor(Number(row.quantity ?? 0))),
        0,
      ),
    };
  }
  const recentOrders = (recentResult.data ?? []) as unknown as Order[];

  const core = buildCoreFromOps(
    activeStoreId,
    periodFrom,
    periodTo,
    granularity,
    ops,
    recentOrders,
  );

  if (!wantExtended || !extendedResult) {
    return core;
  }

  const [financial, activityResult, series] = extendedResult;
  const rawRecent =
    (
      financial as ErpFinancialDashboard & {
        recent_invoices?: Array<{
          id: string;
          invoice_number: string;
          user_id: string;
          total_amount: number;
          created_at: string;
          status: string;
        }>;
      }
    ).recent_invoices ?? [];

  const customerNames = await loadInvoiceCustomerNames(
    supabase,
    rawRecent.map((row) => row.user_id),
  );
  const recentErpInvoices: DashboardErpInvoiceRow[] = rawRecent.map((row) => ({
    id: row.id,
    invoice_number: row.invoice_number,
    total_amount: Number(row.total_amount ?? 0),
    created_at: row.created_at,
    customer_name: customerNames.get(row.user_id) ?? null,
    status: row.status,
  }));

  return {
    ...core,
    erpFinancial: financial
      ? {
          ...financial,
          low_stock_count: core.inventory.productsNeedingRestock,
        }
      : null,
    erpActivity: activityResult.data,
    erpMonthlySeries: series,
    recentErpInvoices,
  };
}
