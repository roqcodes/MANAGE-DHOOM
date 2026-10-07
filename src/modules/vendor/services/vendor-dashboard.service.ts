import "server-only";

import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { requireVendorProfile } from "@/modules/admin/services/rbac.service";
import type {
  VendorDashboardStats,
  VendorRecentPoRow,
} from "@/modules/vendor/types";

const LOW_STOCK_MAX = 10;

async function countPurchaseOrders(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  vendorId: string,
  status: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("purchase_orders")
    .select("id", { count: "exact", head: true })
    .eq("vendor_id", vendorId)
    .eq("status", status);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function getVendorDashboardStats(): Promise<VendorDashboardStats> {
  const profile = await requireVendorProfile();
  const supabase = await createSupabaseServerClient();
  const vendorId = profile.id;

  const [
    pendingPo,
    acceptedPo,
    deliveredPo,
    supplyRes,
    lowStockRes,
  ] = await Promise.all([
    countPurchaseOrders(supabase, vendorId, "pending"),
    countPurchaseOrders(supabase, vendorId, "accepted"),
    countPurchaseOrders(supabase, vendorId, "delivered"),
    supabase
      .from("vendor_products")
      .select("id", { count: "exact", head: true })
      .eq("vendor_id", vendorId),
    supabase
      .from("vendor_products")
      .select("id", { count: "exact", head: true })
      .eq("vendor_id", vendorId)
      .gt("stock", 0)
      .lte("stock", LOW_STOCK_MAX),
  ]);

  if (supplyRes.error) throw new Error(supplyRes.error.message);
  if (lowStockRes.error) throw new Error(lowStockRes.error.message);

  return {
    pendingPo,
    acceptedPo,
    deliveredPo,
    supplySkus: supplyRes.count ?? 0,
    lowStockSkus: lowStockRes.count ?? 0,
  };
}

export async function getVendorRecentPurchaseOrders(
  limit = 8,
): Promise<VendorRecentPoRow[]> {
  const profile = await requireVendorProfile();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("purchase_orders")
    .select("id,status,total_amount,created_at")
    .eq("vendor_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as VendorRecentPoRow[];
}
