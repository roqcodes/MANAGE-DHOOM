import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { invokeRpc } from "@/lib/integrations/supabase/rpc";
import type {
  FulfillmentQueueRow,
  OrderFulfillment,
  OrderInventoryFulfillmentStatus,
  Paginated,
} from "@/common/admin/types";
import { PAGE_SIZE } from "@/common/admin/types";
import {
  assignOrderFulfillmentStore,
  shipOrderFulfillments,
} from "@/modules/orders/services/order-wallet-inventory.service";

export type FulfillmentQueueFilter =
  | "needs_assignment"
  | "ready_to_ship"
  | "all_open";

export async function fetchOrderFulfillments(
  orderId: string,
): Promise<OrderFulfillment[]> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data: fulfillments, error } = await supabase
    .from("order_fulfillments")
    .select(
      "id, status, store_id, shipment_number, reserved_at, shipped_at, inventory_committed, stores(name), order_fulfillment_items(id, variant_id, quantity, reserved_quantity, shipped_quantity)",
    )
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  const variantIds = [
    ...new Set(
      (fulfillments ?? []).flatMap((row) =>
        (row.order_fulfillment_items ?? []).map((item) => item.variant_id),
      ),
    ),
  ];

  const variantNames: Record<string, string> = {};
  if (variantIds.length > 0) {
    const { data: variants } = await supabase
      .from("product_variants")
      .select("id, name, products(name)")
      .in("id", variantIds);

    for (const variant of variants ?? []) {
      const product = variant.products as { name: string | null } | null;
      variantNames[variant.id] =
        product?.name && variant.name
          ? `${product.name} — ${variant.name}`
          : product?.name ?? variant.name ?? variant.id;
    }
  }

  return (fulfillments ?? []).map((row) => {
    const store = row.stores as { name: string } | null;
    const items = (row.order_fulfillment_items ?? []).map((item) => ({
      id: item.id,
      variant_id: item.variant_id,
      product_name: variantNames[item.variant_id] ?? null,
      quantity: item.quantity,
      reserved_quantity: item.reserved_quantity,
      shipped_quantity: item.shipped_quantity,
    }));

    return {
      id: row.id,
      status: row.status,
      store_id: row.store_id,
      store_name: store?.name ?? null,
      shipment_number: row.shipment_number,
      reserved_at: row.reserved_at,
      shipped_at: row.shipped_at,
      inventory_committed: row.inventory_committed,
      items,
    };
  });
}

export async function listFulfillmentQueue(
  filter: FulfillmentQueueFilter = "needs_assignment",
  page = 0,
): Promise<Paginated<FulfillmentQueueRow>> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const from = page * PAGE_SIZE;

  let query = supabase
    .from("orders")
    .select(
      "id, created_at, status, fulfillment_status, total_amount, users:users!orders_user_fkey(name), order_items(id), order_fulfillments(id, status)",
      { count: "exact" },
    )
    .or("source.is.null,source.eq.online")
    .not("status", "in", "(cancelled,delivered)")
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (filter === "needs_assignment") {
    query = query.eq("fulfillment_status", "pending_assignment");
  } else if (filter === "ready_to_ship") {
    query = query.in("fulfillment_status", [
      "reserved",
      "multi_shipment",
      "partially_shipped",
    ]);
  } else {
    query = query.in("fulfillment_status", [
      "pending_assignment",
      "reserved",
      "multi_shipment",
      "partially_shipped",
    ]);
  }

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);

  const rows: FulfillmentQueueRow[] = (data ?? []).map((row) => {
    const fulfillments = row.order_fulfillments ?? [];
    const pendingAssignmentCount = fulfillments.filter(
      (f) => f.status === "pending_assignment",
    ).length;

    return {
      id: row.id,
      created_at: row.created_at,
      status: row.status,
      fulfillment_status: row.fulfillment_status as OrderInventoryFulfillmentStatus,
      total_amount: row.total_amount,
      customer_name: (row.users as { name: string | null } | null)?.name ?? null,
      item_count: row.order_items?.length ?? 0,
      fulfillment_count: fulfillments.length,
      pending_assignment_count: pendingAssignmentCount,
    };
  });

  return { data: rows, total: count ?? 0 };
}

export async function shipSingleOrderFulfillment(
  fulfillmentId: string,
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { error } = await invokeRpc(supabase, "ship_order_fulfillment", {
    p_fulfillment_id: fulfillmentId,
  });
  if (error) throw new Error(error.message);
}

export {
  assignOrderFulfillmentStore,
  shipOrderFulfillments,
};
