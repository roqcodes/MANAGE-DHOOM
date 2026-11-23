import "server-only";

import { endOfWeek, format, startOfWeek } from "date-fns";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type {
  AdminPurchaseOrderDetail,
  AdminPurchaseOrderListRow,
  Paginated,
  PurchaseOrderCatalogStats,
  PurchaseOrderDeliveryFilter,
  PurchaseOrderStatusFilter,
} from "@/common/admin/types";
import { PAGE_SIZE } from "@/common/admin/types";
import {
  buildPurchaseOrderDeliveryMonthTabs,
  expectedDeliveryMonthRange,
  parsePurchaseOrderDeliveryMonth,
  type PurchaseOrderDeliveryMonthFilter,
} from "@/modules/purchase-orders/lib/delivery-month-filter";

const TERMINAL_PO_STATUSES = ["cancelled", "closed", "fully_received"] as const;
const TERMINAL_PO_STATUS_FILTER = `(${TERMINAL_PO_STATUSES.map((s) => `"${s}"`).join(",")})`;
const AWAITING_RECEIPT_STATUSES = ["accepted", "delivered", "partially_received", "by_sea", "by_air", "in_customs"] as const;
const IN_TRANSIT_STATUSES = ["by_sea", "by_air", "in_customs"] as const;

function todayIso() {
  return format(new Date(), "yyyy-MM-dd");
}

function weekRangeIso() {
  const now = new Date();
  return {
    start: format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"),
    end: format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"),
  };
}

function excludeTerminalPoStatuses<
  T extends { not: (column: string, operator: string, value: string) => T },
>(query: T): T {
  return query.not("status", "in", TERMINAL_PO_STATUS_FILTER);
}

function applyDeliveryFilter<
  T extends {
    not: (column: string, operator: string, value: string | null) => T;
    gte: (column: string, value: string) => T;
    lte: (column: string, value: string) => T;
    lt: (column: string, value: string) => T;
    in: (column: string, values: readonly string[]) => T;
  },
>(query: T, delivery: PurchaseOrderDeliveryFilter): T {
  const today = todayIso();
  const week = weekRangeIso();

  switch (delivery) {
    case "upcoming":
      return excludeTerminalPoStatuses(query)
        .gte("expected_delivery_date", today)
        .not("expected_delivery_date", "is", null);
    case "due_this_week":
      return excludeTerminalPoStatuses(query)
        .gte("expected_delivery_date", week.start)
        .lte("expected_delivery_date", week.end)
        .not("expected_delivery_date", "is", null);
    case "overdue":
      return excludeTerminalPoStatuses(query)
        .lt("expected_delivery_date", today)
        .not("expected_delivery_date", "is", null);
    case "awaiting_receipt":
      return excludeTerminalPoStatuses(query).in(
        "status",
        [...AWAITING_RECEIPT_STATUSES],
      );
    default:
      return query;
  }
}

export async function listAdminPurchaseOrders(options: {
  status?: PurchaseOrderStatusFilter;
  delivery?: PurchaseOrderDeliveryFilter | null;
  deliveryMonth?: string | null;
  page?: number;
  vendorId?: string | null;
}): Promise<Paginated<AdminPurchaseOrderListRow>> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const status = options.status ?? "all";
  const delivery = options.delivery ?? null;
  const deliveryMonth = parsePurchaseOrderDeliveryMonth(options.deliveryMonth);
  const page = options.page ?? 0;
  const vendorId = options.vendorId ?? null;
  const from = page * PAGE_SIZE;

  let query = supabase
    .from("purchase_orders")
    .select(
      "id,vendor_id,status,total_amount,created_at,po_number,store_id,reference,po_date,expected_delivery_date,vendors(name),stores(name)",
      { count: "exact" },
    );

  if (deliveryMonth !== "all") {
    const range = expectedDeliveryMonthRange(deliveryMonth);
    query = query
      .gte("expected_delivery_date", range.start)
      .lte("expected_delivery_date", range.end)
      .not("expected_delivery_date", "is", null)
      .order("expected_delivery_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
  } else if (delivery) {
    query = applyDeliveryFilter(query, delivery);
    query = query
      .order("expected_delivery_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  if (status === "production") {
    query = query.in("status", ["pending", "production"]);
  } else if (status !== "all") {
    query = query.eq("status", status);
  }

  if (vendorId) query = query.eq("vendor_id", vendorId);

  query = query.range(from, from + PAGE_SIZE - 1);

  const { data, count, error } = await query;

  if (error) throw new Error(error.message);

  return {
    data: (data ?? []) as unknown as AdminPurchaseOrderListRow[],
    total: count ?? 0,
  };
}

export async function getPurchaseOrderCatalogStats(): Promise<PurchaseOrderCatalogStats> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const today = todayIso();
  const week = weekRangeIso();

  const openCountQuery = () =>
    excludeTerminalPoStatuses(
      supabase
        .from("purchase_orders")
        .select("id", { count: "exact", head: true }),
    );

  const monthTabs = buildPurchaseOrderDeliveryMonthTabs();
  const monthTabsNeedingQuery = monthTabs.filter((tab) => tab.id !== "all");
  const monthCountQueries = monthTabsNeedingQuery.map((tab) => {
    const range = expectedDeliveryMonthRange(
      tab.id as Exclude<PurchaseOrderDeliveryMonthFilter, "all">,
    );
    return supabase
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .gte("expected_delivery_date", range.start)
      .lte("expected_delivery_date", range.end)
      .not("expected_delivery_date", "is", null);
  });

  const [
    totalRes,
    pendingRes,
    productionRes,
    byAirRes,
    bySeaRes,
    inCustomsRes,
    inTransitRes,
    receivedRes,
    invoiceRes,
    acceptedRes,
    deliveredRes,
    cancelledRes,
    dueThisWeekRes,
    overdueRes,
    awaitingReceiptRes,
    ...monthCountResults
  ] = await Promise.all([
    supabase.from("purchase_orders").select("id", { count: "exact", head: true }),
    supabase
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "production"),
    supabase
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "by_air"),
    supabase
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "by_sea"),
    supabase
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "in_customs"),
    supabase
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .in("status", [...IN_TRANSIT_STATUSES]),
    supabase
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "received"),
    supabase
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "fully_received"),
    supabase
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "accepted"),
    supabase
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "delivered"),
    supabase
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "cancelled"),
    openCountQuery()
      .gte("expected_delivery_date", week.start)
      .lte("expected_delivery_date", week.end)
      .not("expected_delivery_date", "is", null),
    openCountQuery()
      .lt("expected_delivery_date", today)
      .not("expected_delivery_date", "is", null),
    openCountQuery().in("status", [...AWAITING_RECEIPT_STATUSES]),
    ...monthCountQueries,
  ]);

  const deliveryMonthCounts: Record<string, number> = { all: totalRes.count ?? 0 };
  monthTabsNeedingQuery.forEach((tab, index) => {
    deliveryMonthCounts[tab.id] = monthCountResults[index]?.count ?? 0;
  });

  return {
    totalPurchaseOrders: totalRes.count ?? 0,
    pendingCount: pendingRes.count ?? 0,
    productionCount: (productionRes.count ?? 0) + (pendingRes.count ?? 0),
    byAirCount: byAirRes.count ?? 0,
    bySeaCount: bySeaRes.count ?? 0,
    inCustomsCount: inCustomsRes.count ?? 0,
    inTransitCount: inTransitRes.count ?? 0,
    receivedCount: receivedRes.count ?? 0,
    invoiceCount: invoiceRes.count ?? 0,
    acceptedCount: acceptedRes.count ?? 0,
    deliveredCount: deliveredRes.count ?? 0,
    cancelledCount: cancelledRes.count ?? 0,
    dueThisWeekCount: dueThisWeekRes.count ?? 0,
    overdueCount: overdueRes.count ?? 0,
    awaitingReceiptCount: awaitingReceiptRes.count ?? 0,
    deliveryMonthCounts,
  };
}

export async function getAdminPurchaseOrderById(
  id: string,
): Promise<AdminPurchaseOrderDetail | null> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("purchase_orders")
    .select(
      "id,vendor_id,status,total_amount,created_at,vendors(id,name,contact),purchase_order_items(id,variant_id,quantity,price,product_variants(id,name,products(id,name)))",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return data as unknown as AdminPurchaseOrderDetail;
}

/**
 * Admin may cancel a PO only while it is still pending or in production.
 */
export async function cancelAdminPurchaseOrder(poId: string): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("purchase_orders")
    .update({ status: "cancelled" })
    .eq("id", poId)
    .in("status", ["pending", "production"])
    .select("id");

  if (error) throw new Error(error.message);
  if (!data?.length) {
    throw new Error(
      "Purchase order cannot be cancelled (only pending or production POs can be cancelled).",
    );
  }
}

export type PoTransitionStatus =
  | "production"
  | "by_sea"
  | "by_air"
  | "in_customs"
  | "received";

/**
 * Updates the status of a purchase order and optionally sets the expected delivery date.
 * Used by the new PO lifecycle flow (Ready For Pickup → transit mode → Received).
 */
export async function updatePurchaseOrderStatus(
  poId: string,
  status: PoTransitionStatus,
  expectedDate?: string,
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const patch: {
    status: string;
    updated_at: string;
    expected_delivery_date?: string | null;
  } = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (expectedDate) {
    patch.expected_delivery_date = expectedDate;
  }

  const { data, error } = await supabase
    .from("purchase_orders")
    .update(patch)
    .eq("id", poId)
    .select("id");

  if (error) throw new Error(error.message);
  if (!data?.length) {
    throw new Error("Purchase order not found or could not be updated.");
  }
}
