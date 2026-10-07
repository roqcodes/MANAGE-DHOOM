import "server-only";

import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { getCurrentSessionProfile } from "@/modules/auth/services/auth.service";
import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import type { Paginated } from "@/common/admin/types";
import { PAGE_SIZE } from "@/common/admin/types";

export type ReturnStatus = "pending" | "approved" | "rejected" | "refunded";

export interface ReturnRow {
  id: string;
  order_id: string;
  order_item_id: string;
  user_id: string;
  variant_id: string;
  quantity: number;
  reason: string;
  status: ReturnStatus;
  refund_amount: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReturnWithDetails extends ReturnRow {
  order?: { id: string; status: string | null };
  variant?: { id: string; name: string | null };
  customer?: { id: string; name: string | null; email: string | null };
}

export async function createReturn(
  orderId: string,
  orderItemId: string,
  variantId: string,
  quantity: number,
  reason: string,
): Promise<ReturnRow> {
  const { profile } = await getCurrentSessionProfile();

  if (!profile) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const supabase = await createSupabaseServerClient();

  // Verify the order item exists and belongs to this order
  const { data: orderItem } = await supabase
    .from("order_items")
    .select("id, order_id, variant_id, quantity, final_price")
    .eq("id", orderItemId)
    .eq("order_id", orderId)
    .maybeSingle();

  if (!orderItem) {
    throw new Error("Order item not found or does not belong to this order");
  }

  if (orderItem.variant_id !== variantId) {
    throw new Error("Variant does not match order item");
  }

  if (quantity > (orderItem.quantity ?? 0)) {
    throw new Error("Return quantity cannot exceed order quantity");
  }

  // Check for existing pending returns for this item
  const { data: existingReturn } = await supabase
    .from("returns")
    .select("id, quantity")
    .eq("order_item_id", orderItemId)
    .eq("status", "pending")
    .maybeSingle();

  if (existingReturn) {
    throw new Error("There is already a pending return for this item");
  }

  // Calculate refund amount
  const unitPrice = (orderItem.final_price ?? 0) / (orderItem.quantity ?? 1);
  const refundAmount = unitPrice * quantity;

  const { data, error } = await supabase
    .from("returns")
    .insert({
      order_id: orderId,
      order_item_id: orderItemId,
      user_id: profile.id,
      variant_id: variantId,
      quantity,
      reason,
      status: "pending",
      refund_amount: refundAmount,
    })
    .select()
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Failed to create return");

  return data as ReturnRow;
}

export async function getMyReturns(
  page = 0,
): Promise<Paginated<ReturnRow>> {
  const { profile } = await getCurrentSessionProfile();

  if (!profile) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const supabase = await createSupabaseServerClient();
  const from = page * PAGE_SIZE;

  const { data, count, error } = await supabase
    .from("returns")
    .select("*", { count: "exact" })
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (error) throw new Error(error.message);

  return {
    data: (data ?? []) as ReturnRow[],
    total: count ?? 0,
  };
}

export async function getReturnById(
  returnId: string,
): Promise<ReturnWithDetails | null> {
  const { profile } = await getCurrentSessionProfile();

  if (!profile) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("returns")
    .select(
      `
      *,
      orders (id, status),
      product_variants (id, name),
      users (id, name, email)
    `,
    )
    .eq("id", returnId)
    .eq("user_id", profile.id)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (!data) return null;

  return {
    ...data,
    order: (data as any).orders,
    variant: (data as any).product_variants,
    customer: (data as any).users,
  } as ReturnWithDetails;
}

export async function getAllReturns(
  page = 0,
  status?: ReturnStatus,
): Promise<Paginated<ReturnWithDetails>> {
  await requireAdminApiProfile();

  const supabase = await createSupabaseServerClient();
  const from = page * PAGE_SIZE;

  let query = supabase
    .from("returns")
    .select(
      `
      *,
      orders (id, status),
      product_variants (id, name),
      users (id, name, email)
    `,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, count, error } = await query;

  if (error) throw new Error(error.message);

  const returns = (data ?? []).map((row) => ({
    ...row,
    order: (row as any).orders,
    variant: (row as any).product_variants,
    customer: (row as any).users,
  })) as ReturnWithDetails[];

  return {
    data: returns,
    total: count ?? 0,
  };
}

export async function updateReturnStatus(
  returnId: string,
  status: ReturnStatus,
  notes?: string,
): Promise<ReturnRow> {
  await requireAdminApiProfile();

  const supabase = await createSupabaseServerClient();

  const updateData: Record<string, string> = { status };
  if (notes) updateData.notes = notes;

  const { data, error } = await supabase
    .from("returns")
    .update(updateData as any)
    .eq("id", returnId)
    .select()
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Return not found");

  // If refunded, credit wallet only when the original order was paid.
  if (status === "refunded" && data.refund_amount) {
    const { data: order } = await supabase
      .from("orders")
      .select("payment_status")
      .eq("id", data.order_id)
      .maybeSingle();

    if (order?.payment_status === "paid") {
      await supabase.rpc("wallet_top_up", {
        p_amount: data.refund_amount,
        p_reference: `Return refund: ${returnId}`,
      });
    }
  }

  return data as ReturnRow;
}
