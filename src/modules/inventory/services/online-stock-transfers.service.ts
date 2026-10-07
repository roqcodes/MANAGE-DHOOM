import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { invokeRpc } from "@/lib/integrations/supabase/rpc";
import { resolveErpStoreId } from "@/modules/erp/services/store-context.service";

export type OnlineStockTransferRow = {
  id: string;
  transfer_number: string;
  store_id: string;
  product_id: string;
  quantity: number;
  status: "pending_allocation" | "allocated" | "cancelled";
  notes: string | null;
  created_at: string;
  allocated_at: string | null;
  product_name: string;
  store_name: string | null;
  allocations: {
    id: string;
    variant_id: string;
    variant_name: string | null;
    quantity: number;
  }[];
};

export type OnlineStockTransferAllocationInput = {
  variantId: string;
  quantity: number;
};

export async function listOnlineStockTransfers(input?: {
  storeId?: string;
  status?: string;
  page?: number;
  limit?: number;
}): Promise<{ data: OnlineStockTransferRow[]; total: number }> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const storeId = input?.storeId
    ? await resolveErpStoreId(input.storeId)
    : undefined;
  const page = input?.page ?? 0;
  const limit = input?.limit ?? 50;
  const from = page * limit;

  let query = supabase
    .from("online_stock_transfers")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + limit - 1);

  if (storeId) query = query.eq("store_id", storeId);
  if (input?.status === "recent") {
    query = query.in("status", ["allocated", "cancelled"]);
  } else if (input?.status) {
    query = query.eq("status", input.status);
  }

  const { data: transferRows, error, count } = await query;
  if (error) throw new Error(error.message);

  const productIds = [...new Set((transferRows ?? []).map((r) => r.product_id))];
  const storeIds = [...new Set((transferRows ?? []).map((r) => r.store_id))];
  const transferIds = (transferRows ?? []).map((r) => r.id);

  const productMap = new Map<string, string>();
  const storeMap = new Map<string, string>();
  const allocMap = new Map<string, OnlineStockTransferRow["allocations"]>();

  if (productIds.length > 0) {
    const { data: products } = await supabase
      .from("products")
      .select("id, name")
      .in("id", productIds);
    for (const p of products ?? []) {
      productMap.set(p.id, p.name ?? "Product");
    }
  }

  if (storeIds.length > 0) {
    const { data: stores } = await supabase
      .from("stores")
      .select("id, name")
      .in("id", storeIds);
    for (const s of stores ?? []) {
      storeMap.set(s.id, s.name);
    }
  }

  if (transferIds.length > 0) {
    const { data: allocations } = await supabase
      .from("online_stock_transfer_allocations")
      .select("id, transfer_id, variant_id, quantity")
      .in("transfer_id", transferIds);

    const variantIds = [...new Set((allocations ?? []).map((a) => a.variant_id))];
    const variantNameMap = new Map<string, string | null>();

    if (variantIds.length > 0) {
      const { data: variants } = await supabase
        .from("product_variants")
        .select("id, name")
        .in("id", variantIds);
      for (const v of variants ?? []) {
        variantNameMap.set(v.id, v.name);
      }
    }

    for (const a of allocations ?? []) {
      const list = allocMap.get(a.transfer_id) ?? [];
      list.push({
        id: a.id,
        variant_id: a.variant_id,
        variant_name: variantNameMap.get(a.variant_id) ?? null,
        quantity: Number(a.quantity),
      });
      allocMap.set(a.transfer_id, list);
    }
  }

  const rows: OnlineStockTransferRow[] = (transferRows ?? []).map((row) => ({
    id: row.id,
    transfer_number: row.transfer_number,
    store_id: row.store_id,
    product_id: row.product_id,
    quantity: Number(row.quantity),
    status: row.status as OnlineStockTransferRow["status"],
    notes: row.notes,
    created_at: row.created_at,
    allocated_at: row.allocated_at,
    product_name: productMap.get(row.product_id) ?? "Product",
    store_name: storeMap.get(row.store_id) ?? null,
    allocations: allocMap.get(row.id) ?? [],
  }));

  return { data: rows, total: count ?? 0 };
}

export async function createOnlineStockTransfer(input: {
  storeId?: string;
  productId: string;
  quantity: number;
  notes?: string | null;
}): Promise<string> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const storeId = await resolveErpStoreId(input.storeId);

  const { data, error } = await invokeRpc(supabase, "create_online_stock_transfer", {
    p_store_id: storeId,
    p_product_id: input.productId,
    p_quantity: input.quantity,
    p_notes: input.notes ?? null,
  });

  if (error) throw new Error(error.message);
  return data as string;
}

export async function createOnlineStockTransfersBulk(input: {
  storeId?: string;
  notes?: string | null;
  lines: { productId: string; quantity: number }[];
}): Promise<{
  created: string[];
  failed: { productId: string; message: string }[];
}> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const storeId = await resolveErpStoreId(input.storeId);

  const lines = input.lines
    .filter((line) => line.productId && line.quantity > 0)
    .map((line) => ({
      productId: line.productId,
      quantity: Math.floor(line.quantity),
    }));

  if (lines.length === 0) {
    throw new Error("At least one transfer line is required");
  }

  const { data, error } = await invokeRpc(
    supabase,
    "create_online_stock_transfers_bulk",
    {
      p_store_id: storeId,
      p_lines: lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
      })),
      p_notes: input.notes ?? null,
    },
  );

  if (error) {
    return {
      created: [],
      failed: lines.map((line) => ({
        productId: line.productId,
        message: error.message,
      })),
    };
  }

  const payload = data as { created?: string[]; failed?: unknown[] } | null;
  return {
    created: payload?.created ?? [],
    failed: [],
  };
}

export async function allocateOnlineStockTransfer(
  transferId: string,
  allocations: OnlineStockTransferAllocationInput[],
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { error } = await invokeRpc(supabase, "allocate_online_stock_transfer", {
    p_transfer_id: transferId,
    p_allocations: allocations.map((a) => ({
      variantId: a.variantId,
      quantity: a.quantity,
    })),
  });

  if (error) throw new Error(error.message);
}

export async function cancelOnlineStockTransfer(transferId: string): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { error } = await invokeRpc(supabase, "cancel_online_stock_transfer", {
    p_transfer_id: transferId,
  });

  if (error) throw new Error(error.message);
}
