import "server-only";

import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type { Order, OrderStatusFilter } from "@/common/admin/types";

export async function getOrders(
  status: OrderStatusFilter = "all",
  page = 0,
  pageSize = 50,
): Promise<Order[]> {
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("orders")
    .select(
      "id,created_at,status,total_amount,users:users!orders_user_fkey(name,phone)",
    )
    .order("created_at", { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1);

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data } = await query;

  return (data ?? []) as unknown as Order[];
}
