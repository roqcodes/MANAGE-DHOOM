import "server-only";

import type {
  AdminNavBadge,
  AdminNavBadgesPayload,
  AdminNavBadgeTone,
} from "@/common/admin/types";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { getPendingPortalRequestCount } from "@/modules/users/services/users.service";

function setBadge(
  badges: Record<string, AdminNavBadge>,
  href: string,
  count: number,
  tone: AdminNavBadgeTone,
) {
  if (count <= 0) return;
  badges[href] = { count, tone };
}

/** Lightweight counts for sidebar attention pills. */
export async function getAdminNavBadges(): Promise<AdminNavBadgesPayload> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startOfDay = today.toISOString();

  const [
    pendingOrdersRes,
    delayedOrdersRes,
    pendingAssignmentRes,
    pendingTransferRes,
    inventoryHealthRes,
    pendingPoRes,
    pendingUsersRes,
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "processing", "shipped"])
      .lt("created_at", startOfDay),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .or("source.is.null,source.eq.online")
      .eq("fulfillment_status", "pending_assignment")
      .not("status", "in", "(cancelled,delivered)"),
    supabase
      .from("erp_transfer_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "submitted"),
    supabase.rpc(
      "count_inventory_nav_badges" as Parameters<typeof supabase.rpc>[0],
    ),
    supabase
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    getPendingPortalRequestCount(),
  ]);

  const badges: Record<string, AdminNavBadge> = {};

  const pendingOrders = pendingOrdersRes.count ?? 0;
  const delayedOrders = delayedOrdersRes.count ?? 0;
  const ordersCount = pendingOrders || delayedOrders;
  const ordersTone: AdminNavBadgeTone =
    delayedOrders > 0 ? "critical" : "warning";
  setBadge(badges, "/admin/orders", ordersCount, ordersTone);

  setBadge(
    badges,
    "/admin/erp/fulfillment-queue",
    pendingAssignmentRes.count ?? 0,
    "critical",
  );

  setBadge(
    badges,
    "/admin/erp/transfer-approvals",
    pendingTransferRes.count ?? 0,
    "warning",
  );

  let criticalSkus = 0;
  let lowSkus = 0;
  if (inventoryHealthRes.error) {
    console.warn(
      "[nav-badges] count_inventory_nav_badges failed:",
      inventoryHealthRes.error.message,
    );
  } else {
    const inventoryCounts =
      inventoryHealthRes.data &&
      typeof inventoryHealthRes.data === "object" &&
      !Array.isArray(inventoryHealthRes.data)
        ? (inventoryHealthRes.data as { critical?: number; low?: number })
        : null;
    criticalSkus = Math.max(0, inventoryCounts?.critical ?? 0);
    lowSkus = Math.max(0, inventoryCounts?.low ?? 0);
  }
  const inventoryCount = criticalSkus + lowSkus;
  const inventoryTone: AdminNavBadgeTone =
    criticalSkus > 0 ? "critical" : lowSkus > 0 ? "warning" : "info";
  setBadge(badges, "/admin/inventory", inventoryCount, inventoryTone);

  setBadge(
    badges,
    "/admin/purchase-orders",
    pendingPoRes.count ?? 0,
    "warning",
  );

  setBadge(badges, "/admin/users", pendingUsersRes, "warning");

  const dashboardAlerts = Object.entries(badges).filter(
    ([href]) => href !== "/admin",
  );
  if (dashboardAlerts.length > 0) {
    const hasCritical = dashboardAlerts.some(([, b]) => b.tone === "critical");
    setBadge(
      badges,
      "/admin",
      dashboardAlerts.length,
      hasCritical ? "critical" : "warning",
    );
  }

  return { badges };
}
