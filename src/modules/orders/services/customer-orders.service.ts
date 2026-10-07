import "server-only";

import { getCurrentSessionProfile } from "@/modules/auth/services/auth.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";

export interface CustomerOrder {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string | null;
  totalAmount: number | null;
  createdAt: string | null;
  itemCount: number;
  address: {
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    pincode: string;
  } | null;
}

export interface CustomerOrderDetail extends CustomerOrder {
  items: {
    id: string;
    variantId: string | null;
    productName: string | null;
    quantity: number | null;
    price: number | null;
    vendorId: string | null;
  }[];
}

const PAGE_SIZE = 20;

/**
 * Get order history for current user.
 */
export async function getCustomerOrders(
  page = 0,
): Promise<{
  data: CustomerOrder[];
  total: number;
  hasMore: boolean;
}> {
  const { user } = await getCurrentSessionProfile();
  if (!user) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const supabase = await createSupabaseServerClient();
  const from = page * PAGE_SIZE;

  const [dataResult, countResult] = await Promise.all([
    supabase
      .from("orders")
      .select(
        `
        id,
        created_at,
        status,
        payment_status,
        total_amount,
        addresses!inner(
          id,
          line1,
          line2,
          city,
          state,
          pincode
        ),
        order_items!inner(
          id,
          quantity
        )
      `,
        { count: "exact" },
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);

  if (dataResult.error) {
    throw new Error(dataResult.error.message);
  }

  const orders = (dataResult.data || []).map((o: any) => ({
    id: o.id,
    orderNumber: `ORD-${o.id.slice(0, 8).toUpperCase()}`,
    status: o.status,
    paymentStatus: o.payment_status,
    totalAmount: o.total_amount,
    createdAt: o.created_at,
    itemCount: o.order_items?.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0) || 0,
    address: o.addresses?.[0]
      ? {
          line1: o.addresses[0].line1,
          line2: o.addresses[0].line2,
          city: o.addresses[0].city,
          state: o.addresses[0].state,
          pincode: o.addresses[0].pincode,
        }
      : null,
  })) as CustomerOrder[];

  return {
    data: orders,
    total: countResult.count || 0,
    hasMore: from + orders.length < (countResult.count || 0),
  };
}

/**
 * Get single order detail for current user.
 */
export async function getCustomerOrderById(
  orderId: string,
): Promise<CustomerOrderDetail | null> {
  const { user } = await getCurrentSessionProfile();
  if (!user) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("orders")
    .select(
      `
      id,
      created_at,
      status,
      payment_status,
      total_amount,
      addresses!inner(
        id,
        line1,
        line2,
        city,
        state,
        pincode
      ),
      order_items!inner(
        id,
        variant_id,
        quantity,
        price,
        vendor_id,
        product_name
      )
    `,
    )
    .eq("id", orderId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const d = data as any;

  return {
    id: d.id,
    orderNumber: `ORD-${d.id.slice(0, 8).toUpperCase()}`,
    status: d.status,
    paymentStatus: d.payment_status,
    totalAmount: d.total_amount,
    createdAt: d.created_at,
    itemCount: d.order_items?.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0) || 0,
    address: d.addresses?.[0]
      ? {
          line1: d.addresses[0].line1,
          line2: d.addresses[0].line2,
          city: d.addresses[0].city,
          state: d.addresses[0].state,
          pincode: d.addresses[0].pincode,
        }
      : null,
    items: (d.order_items || []).map((item: any) => ({
      id: item.id,
      variantId: item.variant_id,
      productName: item.product_name,
      quantity: item.quantity,
      price: item.price,
      vendorId: item.vendor_id,
    })),
  };
}

/**
 * Get order statistics for current user.
 */
export async function getCustomerOrderStats(): Promise<{
  totalOrders: number;
  pendingOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  totalSpent: number;
}> {
  const { user } = await getCurrentSessionProfile();
  if (!user) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const supabase = await createSupabaseServerClient();

  const [totalRes, pendingRes, deliveredRes, cancelledRes, spentRes] =
    await Promise.all([
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id),
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "pending"),
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "delivered"),
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "cancelled"),
      supabase
        .from("orders")
        .select("total_amount")
        .eq("user_id", user.id)
        .eq("status", "delivered"),
    ]);

  const totalSpent =
    spentRes.data?.reduce((sum, o) => sum + (o.total_amount ?? 0), 0) ?? 0;

  return {
    totalOrders: totalRes.count ?? 0,
    pendingOrders: pendingRes.count ?? 0,
    completedOrders: deliveredRes.count ?? 0,
    cancelledOrders: cancelledRes.count ?? 0,
    totalSpent,
  };
}
