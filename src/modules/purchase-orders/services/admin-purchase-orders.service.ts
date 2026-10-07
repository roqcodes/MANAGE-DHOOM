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

const TERMINAL_PO_STATUSES = ["cancelled", "closed", "fully_received"] as const;
const TERMINAL_PO_STATUS_FILTER = `(${TERMINAL_PO_STATUSES.map((s) => `"${s}"`).join(",")})`;
const AWAITING_RECEIPT_STATUSES = ["accepted", "delivered", "partially_received"] as const;

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
  page?: number;
  vendorId?: string | null;
}): Promise<Paginated<AdminPurchaseOrderListRow>> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const status = options.status ?? "all";
  const delivery = options.delivery ?? null;
  const page = options.page ?? 0;
  const vendorId = options.vendorId ?? null;
  const from = page * PAGE_SIZE;

  let query = supabase
    .from("purchase_orders")
    .select(
      "id,vendor_id,status,total_amount,created_at,po_number,store_id,reference,po_date,expected_delivery_date,vendors(name),stores(name)",
      { count: "exact" },
    );

  if (delivery) {
    query = applyDeliveryFilter(query, delivery);
    query = query
      .order("expected_delivery_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  if (status !== "all") query = query.eq("status", status);

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

  const [
    totalRes,
    pendingRes,
    acceptedRes,
    deliveredRes,
    cancelledRes,
    dueThisWeekRes,
    overdueRes,
    awaitingReceiptRes,
  ] = await Promise.all([
    supabase.from("purchase_orders").select("id", { count: "exact", head: true }),
    supabase
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
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
  ]);

  return {
    totalPurchaseOrders: totalRes.count ?? 0,
    pendingCount: pendingRes.count ?? 0,
    acceptedCount: acceptedRes.count ?? 0,
    deliveredCount: deliveredRes.count ?? 0,
    cancelledCount: cancelledRes.count ?? 0,
    dueThisWeekCount: dueThisWeekRes.count ?? 0,
    overdueCount: overdueRes.count ?? 0,
    awaitingReceiptCount: awaitingReceiptRes.count ?? 0,
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
 * Admin may cancel a PO only while it is still pending (before vendor acceptance).
 */
export async function cancelAdminPurchaseOrder(poId: string): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("purchase_orders")
    .update({ status: "cancelled" })
    .eq("id", poId)
    .eq("status", "pending")
    .select("id");

  if (error) throw new Error(error.message);
  if (!data?.length) {
    throw new Error(
      "Purchase order cannot be cancelled (only pending POs can be cancelled).",
    );
  }
}
