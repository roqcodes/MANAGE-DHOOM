import "server-only";

import { requireVendorProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type { Paginated } from "@/common/admin/types";
import { PAGE_SIZE } from "@/common/admin/types";
import type {
  VendorPoStatusFilter,
  VendorPurchaseOrderDetail,
  VendorPurchaseOrderListRow,
} from "@/modules/vendor/types";

export async function listMyPurchaseOrders(
  status: VendorPoStatusFilter,
  page = 0,
): Promise<Paginated<VendorPurchaseOrderListRow>> {
  const profile = await requireVendorProfile();
  const supabase = await createSupabaseServerClient();
  const from = page * PAGE_SIZE;

  const { data, count } = await supabase
    .from("purchase_orders")
    .select("id,status,total_amount,created_at", { count: "exact" })
    .eq("vendor_id", profile.id)
    .eq("status", status)
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  return {
    data: (data ?? []) as VendorPurchaseOrderListRow[],
    total: count ?? 0,
  };
}

export async function getMyPurchaseOrderStats(): Promise<{
  pending: number;
  accepted: number;
  delivered: number;
}> {
  const profile = await requireVendorProfile();
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("purchase_orders")
    .select("status");

  const pending = data?.filter((r) => r.status === "pending").length ?? 0;
  const accepted = data?.filter((r) => r.status === "accepted").length ?? 0;
  const delivered = data?.filter((r) => r.status === "delivered").length ?? 0;

  return { pending, accepted, delivered };
}

export async function getMyPurchaseOrderById(
  poId: string,
): Promise<VendorPurchaseOrderDetail | null> {
  const profile = await requireVendorProfile();
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("purchase_orders")
    .select(
      "id,vendor_id,status,total_amount,created_at,purchase_order_items(id,variant_id,quantity,price,product_variants(id,name,products(id,name)))",
    )
    .eq("id", poId)
    .eq("vendor_id", profile.id)
    .maybeSingle();

  return data as unknown as VendorPurchaseOrderDetail | null;
}

export async function acceptMyPurchaseOrder(poId: string): Promise<void> {
  const profile = await requireVendorProfile();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("purchase_orders")
    .update({ status: "accepted" })
    .eq("id", poId)
    .eq("vendor_id", profile.id)
    .eq("status", "pending")
    .select("id");

  if (error) throw new Error(error.message);
  if (!data?.length) {
    throw new Error("Purchase order cannot be accepted (wrong status or not found).");
  }
}

export async function markMyPurchaseOrderDelivered(poId: string): Promise<void> {
  const profile = await requireVendorProfile();
  const supabase = await createSupabaseServerClient();

  const { data: po, error: fetchErr } = await supabase
    .from("purchase_orders")
    .select("id,status")
    .eq("id", poId)
    .eq("vendor_id", profile.id)
    .maybeSingle();

  if (fetchErr) throw new Error(fetchErr.message);
  if (!po) throw new Error("Purchase order not found.");
  if (po.status === "delivered") return;
  if (po.status !== "accepted") {
    throw new Error("Purchase order must be accepted before marking delivered.");
  }

  const { data: items, error: itemsErr } = await supabase
    .from("purchase_order_items")
    .select("variant_id,quantity")
    .eq("po_id", poId);

  if (itemsErr) throw new Error(itemsErr.message);

  // Stock increases only via ERP purchase bill finalize, not vendor PO delivery.

  const { data: updated, error: updErr } = await supabase
    .from("purchase_orders")
    .update({ status: "delivered" })
    .eq("id", poId)
    .eq("vendor_id", profile.id)
    .eq("status", "accepted")
    .select("id");

  if (updErr) throw new Error(updErr.message);
  if (!updated?.length) {
    throw new Error("Could not mark purchase order as delivered.");
  }
}
