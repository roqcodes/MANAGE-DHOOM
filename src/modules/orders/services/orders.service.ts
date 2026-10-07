import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { invokeRpc } from "@/lib/integrations/supabase/rpc";
import { resolveErpStoreId } from "@/modules/erp/services/store-context.service";
import type { Database } from "@/lib/integrations/supabase/types";
import type {
  Order,
  OrderCatalogStats,
  OrderInventoryFulfillmentStatus,
  OrderItem,
  OrderItemPreview,
  OrderStatusFilter,
  OrderWithItems,
  Paginated,
  VariantGroup,
} from "@/common/admin/types";
import { PAGE_SIZE } from "@/common/admin/types";
import { normalizeOrderAddress } from "@/modules/orders/lib/order-address";
import { notifyOrderStatusChange } from "@/modules/admin/services/push-notifications.service";
import { shipOrderFulfillments } from "@/modules/orders/services/order-wallet-inventory.service";
import { fetchOrderFulfillments } from "@/modules/orders/services/order-fulfillment.service";

export type OrderChannel = "online" | "erp";

export interface OrderFilterUserRow {
  id: string;
  name: string | null;
  email: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyOrderChannelFilter(query: any, channel: OrderChannel) {
  if (channel === "erp") {
    return query.eq("source", "sales_order");
  }
  return query.or("source.is.null,source.eq.online,source.eq.manual");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyOrderChannelFilterOnOrderItems(query: any, channel: OrderChannel) {
  if (channel === "erp") {
    return query.eq("orders.source", "sales_order");
  }
  return query.or("source.is.null,source.eq.online,source.eq.manual", {
    foreignTable: "orders",
  });
}

type OrderListRow = Omit<Order, "item_count" | "order_items_preview" | "customer_order_count" | "store_name"> & {
  order_items?: OrderItemPreview[] | null;
  stores?: { name: string } | null;
};

async function customerOrderCounts(
  userIds: string[],
): Promise<Record<string, number>> {
  if (userIds.length === 0) return {};

  const supabase = await createSupabaseServerClient();
  const { data, error } = await invokeRpc(supabase, "get_user_order_counts", {
    p_user_ids: userIds,
  });

  const counts: Record<string, number> = {};
  if (error) {
    const { data: fallback } = await supabase
      .from("orders")
      .select("user_id")
      .in("user_id", userIds);
    for (const row of fallback ?? []) {
      const uid = row.user_id as string | null;
      if (!uid) continue;
      counts[uid] = (counts[uid] ?? 0) + 1;
    }
    return counts;
  }

  for (const row of (data ?? []) as { user_id: string; order_count: number }[]) {
    counts[row.user_id] = Number(row.order_count ?? 0);
  }
  return counts;
}

function mapOrderListRow(
  row: OrderListRow,
  customerCounts: Record<string, number>,
): Order {
  const preview = row.order_items ?? [];
  const userId = row.users?.id;

  return {
    id: row.id,
    created_at: row.created_at,
    status: row.status,
    payment_status: row.payment_status,
    total_amount: row.total_amount,
    merchant_note: row.merchant_note,
    customer_edited_at: row.customer_edited_at ?? null,
    users: row.users,
    item_count: preview.length,
    order_items_preview: preview,
    customer_order_count: userId ? (customerCounts[userId] ?? 0) : 0,
    sales_order_number: row.sales_order_number ?? null,
    reference_number: row.reference_number ?? null,
    shipment_date: row.shipment_date ?? null,
    delivery_method: row.delivery_method ?? null,
    store_name: row.stores?.name ?? null,
    source: (row as { source?: string | null }).source ?? null,
    fulfillment_status:
      ((row as { fulfillment_status?: string | null }).fulfillment_status ??
        null) as OrderInventoryFulfillmentStatus | null,
    inventory_reserved:
      (row as { inventory_reserved?: boolean | null }).inventory_reserved ?? null,
  };
}

export async function getOrders(
  status: OrderStatusFilter = "all",
  userId: string | null = null,
  page = 0,
  channel: OrderChannel = "online",
  storeId?: string | null,
): Promise<Paginated<Order>> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const from = page * PAGE_SIZE;
  const activeStoreId = await resolveErpStoreId(storeId);

  let query = applyOrderChannelFilter(
    supabase
      .from("orders")
      .select(
        "id,created_at,status,payment_status,total_amount,merchant_note,customer_edited_at,source,fulfillment_status,inventory_reserved,sales_order_number,reference_number,shipment_date,delivery_method,users:users!orders_user_fkey(id,name,email,phone),stores(name),order_items(id,product_name,quantity)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1),
    channel,
  );

  if (status !== "all") query = query.eq("status", status);
  if (userId) query = query.eq("user_id", userId);
  if (activeStoreId) query = query.eq("store_id", activeStoreId);

  const { data, count } = await query;
  const rows = (data ?? []) as unknown as OrderListRow[];
  const userIds = [
    ...new Set(
      rows.map((r) => r.users?.id).filter((id): id is string => Boolean(id)),
    ),
  ];
  const customerCounts = await customerOrderCounts(userIds);

  return {
    data: rows.map((row) => mapOrderListRow(row, customerCounts)),
    total: count ?? 0,
  };
}

type VariantRowForOrder = {
  id: string;
  name: string | null;
  variant_group_id: string | null;
  product_id: string | null;
  products: {
    id: string;
    name: string | null;
    image_url: string | null;
    variant_layout: "flat" | "grouped" | null;
  } | null;
  variant_images: Array<{
    url: string;
    is_preview: boolean;
    sort_order: number;
  }> | null;
};

async function enrichOrderItems(
  items: OrderItem[],
): Promise<{
  items: OrderItem[];
  variant_groups: Record<string, VariantGroup[]>;
}> {
  const variantIds = [
    ...new Set(
      items
        .map((i) => i.variant_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  if (variantIds.length === 0) {
    return { items, variant_groups: {} };
  }

  const supabase = await createSupabaseServerClient();
  const { data: variantRows, error } = await supabase
    .from("product_variants")
    .select(
      "id,name,variant_group_id,product_id,products(id,name,image_url,variant_layout),variant_images(url,is_preview,sort_order)",
    )
    .in("id", variantIds);

  if (error) throw new Error(error.message);

  const byVariantId = new Map<string, VariantRowForOrder>();
  const productIds = new Set<string>();

  for (const row of (variantRows ?? []) as unknown as VariantRowForOrder[]) {
    byVariantId.set(row.id, row);
    if (row.products?.id) productIds.add(row.products.id);
  }

  const variant_groups: Record<string, VariantGroup[]> = {};
  if (productIds.size > 0) {
    const { data: groups, error: groupErr } = await supabase
      .from("variant_groups")
      .select("id,product_id,name,sort_order")
      .in("product_id", [...productIds])
      .order("sort_order", { ascending: true });

    if (groupErr) throw new Error(groupErr.message);

    for (const g of groups ?? []) {
      const pid = g.product_id as string;
      if (!variant_groups[pid]) variant_groups[pid] = [];
      variant_groups[pid].push({
        id: g.id,
        product_id: pid,
        name: g.name,
        sort_order: g.sort_order,
      });
    }
  }

  const enrichedItems: OrderItem[] = items.map((item) => {
    if (!item.variant_id) return item;
    const v = byVariantId.get(item.variant_id);
    if (!v) return item;

    const images = [...(v.variant_images ?? [])].sort((a, b) => {
      if (a.is_preview !== b.is_preview) return a.is_preview ? -1 : 1;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
    const thumb = images[0]?.url ?? v.products?.image_url ?? null;
    const layout =
      v.products?.variant_layout === "grouped" ? "grouped" : "flat";

    return {
      ...item,
      variant_meta: {
        id: v.id,
        name: v.name,
        variant_group_id: v.variant_group_id,
        product: v.products
          ? {
              id: v.products.id,
              name: v.products.name,
              image_url: v.products.image_url,
              variant_layout: layout,
            }
          : null,
        image_url: thumb,
      },
    };
  });

  return { items: enrichedItems, variant_groups };
}

export async function getOrdersCatalogStats(
  channel: OrderChannel = "online",
  storeId?: string | null,
): Promise<OrderCatalogStats> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const activeStoreId = await resolveErpStoreId(storeId);

  if (activeStoreId) {
    const rpc = await invokeRpc(supabase, "get_admin_order_channel_stats", {
      p_store_id: activeStoreId,
      p_channel: channel,
    });
    if (!rpc.error && rpc.data && typeof rpc.data === "object") {
      const row = rpc.data as {
        total_orders?: number;
        pending_count?: number;
        processing_count?: number;
        shipped_count?: number;
        delivered_count?: number;
        cancelled_count?: number;
        items_ordered?: number;
        orders_fulfilled?: number;
        sales_reversals?: number;
      };
      return {
        totalOrders: Number(row.total_orders ?? 0),
        pendingCount: Number(row.pending_count ?? 0),
        processingCount: Number(row.processing_count ?? 0),
        shippedCount: Number(row.shipped_count ?? 0),
        deliveredCount: Number(row.delivered_count ?? 0),
        cancelledCount: Number(row.cancelled_count ?? 0),
        itemsOrdered: Number(row.items_ordered ?? 0),
        ordersFulfilled: Number(row.orders_fulfilled ?? 0),
        salesReversals: Number(row.sales_reversals ?? 0),
      };
    }
  }

  const scopeOrders = (query: ReturnType<typeof supabase.from>) => {
    let scoped = applyOrderChannelFilter(query, channel);
    if (activeStoreId) scoped = scoped.eq("store_id", activeStoreId);
    return scoped;
  };

  const [
    totalRes,
    pendingRes,
    processingRes,
    shippedRes,
    deliveredRes,
    cancelledRes,
    itemsRes,
    reversalsRes,
  ] = await Promise.all([
    scopeOrders(supabase.from("orders").select("id", { count: "exact", head: true })),
    scopeOrders(
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
    ),
    scopeOrders(
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("status", "processing"),
    ),
    scopeOrders(
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("status", "shipped"),
    ),
    scopeOrders(
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("status", "delivered"),
    ),
    scopeOrders(
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("status", "cancelled"),
    ),
    applyOrderChannelFilterOnOrderItems(
      supabase.from("order_items").select("quantity, orders!inner(source)"),
      channel,
    ),
    scopeOrders(
      supabase
        .from("orders")
        .select("total_amount")
        .eq("status", "cancelled"),
    ),
  ]);

  const itemsOrdered = (itemsRes.data ?? []).reduce(
    (sum: number, row: { quantity: number | null }) =>
      sum + Number(row.quantity ?? 0),
    0,
  );

  const salesReversals = (reversalsRes.data ?? []).reduce(
    (sum: number, row: { total_amount: number | null }) =>
      sum + Number(row.total_amount ?? 0),
    0,
  );

  const deliveredCount = deliveredRes.count ?? 0;
  const shippedCount = shippedRes.count ?? 0;

  return {
    totalOrders: totalRes.count ?? 0,
    pendingCount: pendingRes.count ?? 0,
    processingCount: processingRes.count ?? 0,
    shippedCount,
    deliveredCount,
    cancelledCount: cancelledRes.count ?? 0,
    itemsOrdered,
    ordersFulfilled: deliveredCount + shippedCount,
    salesReversals,
  };
}

export async function getOrderById(id: string): Promise<OrderWithItems | null> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id,created_at,status,payment_status,total_amount,subtotal,tax,discount,merchant_note,customer_edited_at,address_id,store_id,source,fulfillment_status,inventory_reserved,inventory_committed,preferred_delivery_date,shipment_date,sales_order_number,reference_number,delivery_method,invoice_id,tax_inclusive,users:users!orders_user_fkey(id,name,email,phone),stores(name),order_items(id,order_id,product_id,variant_id,quantity,price,product_name,vendor_id,base_price,final_price,margin_amount,customer_edit_flag,tax_rate_percent,created_at)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as unknown as Omit<OrderWithItems, "addresses" | "customer_order_count"> & {
    users: OrderWithItems["users"];
    address_id: string | null;
    stores?: { name: string } | null;
  };

  let addresses: OrderWithItems["addresses"] = null;
  if (row.address_id) {
    const { data: addr, error: addrError } = await supabase
      .from("addresses")
      .select("*")
      .eq("id", row.address_id)
      .maybeSingle();
    if (addrError) throw new Error(addrError.message);
    addresses = normalizeOrderAddress(addr as Record<string, unknown> | null);
  }

  const userId = row.users?.id;
  let customer_order_count = 0;

  if (userId) {
    const { count } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    customer_order_count = count ?? 0;
  }

  const { items: enrichedItems, variant_groups } = await enrichOrderItems(
    row.order_items ?? [],
  );

  const isOnline = !row.source || row.source === "online";
  const fulfillments = isOnline
    ? await fetchOrderFulfillments(id)
    : [];

  let linked_invoice: OrderWithItems["linked_invoice"] = null;
  const { data: activeInvoice } = await supabase
    .from("invoices")
    .select("id, status")
    .eq("order_id", id)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeInvoice) {
    linked_invoice = { id: activeInvoice.id, status: activeInvoice.status };
  } else if (row.invoice_id) {
    const { data: inv } = await supabase
      .from("invoices")
      .select("id, status")
      .eq("id", row.invoice_id)
      .maybeSingle();
    linked_invoice = inv ? { id: inv.id, status: inv.status } : null;
  } else {
    const { data: inv } = await supabase
      .from("invoices")
      .select("id, status")
      .eq("order_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    linked_invoice = inv ? { id: inv.id, status: inv.status } : null;
  }

  return {
    ...row,
    store_name: row.stores?.name ?? null,
    linked_invoice,
    order_items: enrichedItems,
    variant_groups,
    addresses,
    customer_order_count,
    fulfillments,
  };
}

export async function listUsersForOrderFilter(): Promise<OrderFilterUserRow[]> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("users")
    .select("id,name,email")
    .order("name", { ascending: true })
    .limit(500);

  return (data ?? []) as OrderFilterUserRow[];
}

export async function updateOrderStatusById(
  orderId: string,
  status: string,
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data: existing, error: readErr } = await supabase
    .from("orders")
    .select("status, source, inventory_committed")
    .eq("id", orderId)
    .maybeSingle();

  if (readErr) throw new Error(readErr.message);
  if (!existing) throw new Error("Order not found");
  if (existing.status === "cancelled") {
    throw new Error("Cannot update a cancelled order.");
  }

  const isOnline =
    !existing.source || existing.source === "online";

  if (
    status === "shipped" &&
    isOnline &&
    !existing.inventory_committed
  ) {
    await shipOrderFulfillments(orderId);
    await notifyOrderStatusChange(orderId, "shipped").catch(() => undefined);
    return;
  }

  const { error } = await supabase
    .from("orders")
    .update({
      status,
      ...(status === "processing" ? { customer_edited_at: null } : {}),
    })
    .eq("id", orderId);
  if (error) throw new Error(error.message);
  await notifyOrderStatusChange(orderId, status).catch(() => undefined);
}

export async function updateOrderDetailsById(
  orderId: string,
  input: {
    status?: string;
    paymentStatus?: string;
    merchantNote?: string | null;
    shipmentDate?: string | null;
  },
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data: existing, error: readErr } = await supabase
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .maybeSingle();

  if (readErr) throw new Error(readErr.message);
  if (!existing) throw new Error("Order not found");
  if (existing.status === "cancelled" && input.status !== "cancelled") {
    throw new Error("Cannot modify a cancelled order.");
  }

  const updateData: Database["public"]["Tables"]["orders"]["Update"] = {};
  if (input.status !== undefined) updateData.status = input.status;
  if (input.paymentStatus !== undefined) {
    updateData.payment_status = input.paymentStatus;
  }
  if (input.merchantNote !== undefined) {
    updateData.merchant_note = input.merchantNote;
  }
  if (input.shipmentDate !== undefined) {
    updateData.shipment_date = input.shipmentDate;
  }

  if (Object.keys(updateData).length === 0) return;

  const { error } = await supabase
    .from("orders")
    .update(updateData)
    .eq("id", orderId);

  if (error) throw new Error(error.message);
  if (input.status) {
    await notifyOrderStatusChange(orderId, input.status).catch(() => undefined);
  }
}

export async function updateOrdersStatusByIds(
  orderIds: string[],
  status: string,
): Promise<void> {
  if (orderIds.length === 0) return;

  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("orders")
    .update({ status })
    .in("id", orderIds);
  if (error) throw new Error(error.message);
  await Promise.all(orderIds.map((id) => notifyOrderStatusChange(id, status).catch(() => undefined)));
}
