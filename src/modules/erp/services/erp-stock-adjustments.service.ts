import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type {
  ErpStockAdjustmentListRow,
  StockAdjustmentLineInput,
} from "@/common/erp/inventory-types";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import { resolveErpStoreId } from "@/modules/erp/services/store-context.service";
import type { Json } from "@/lib/integrations/supabase/types";

export async function listStockAdjustments(
  page = 0,
  limit = 20,
  filters?: { storeId?: string; search?: string },
): Promise<{
  data: ErpStockAdjustmentListRow[];
  total: number;
}> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const from = page * limit;
  const activeStoreId = await resolveErpStoreId(filters?.storeId);

  let query = supabase
    .from("erp_stock_adjustments")
    .select("id, adjustment_number, store_id, adjustment_date, status, total_add_cost, total_remove_cost", { count: "exact" })
    .order("adjustment_date", { ascending: false })
    .range(from, from + limit - 1);

  if (activeStoreId) query = query.eq("store_id", activeStoreId);
  if (filters?.search?.trim()) {
    query = query.ilike("adjustment_number", `%${filters.search.trim()}%`);
  }

  const { data, error, count } = await query;

  if (error) throw new Error(error.message);

  const storeIds = [...new Set((data ?? []).map((r) => r.store_id))];
  const storeMap = new Map<string, string>();
  if (storeIds.length > 0) {
    const { data: stores } = await supabase.from("stores").select("id, name").in("id", storeIds);
    for (const s of stores ?? []) storeMap.set(s.id, s.name);
  }

  return {
    data: (data ?? []).map((row) => ({
      id: row.id,
      adjustment_number: row.adjustment_number,
      store_id: row.store_id,
      adjustment_date: row.adjustment_date,
      status: row.status,
      total_add_cost: Number(row.total_add_cost ?? 0),
      total_remove_cost: Number(row.total_remove_cost ?? 0),
      store_name: storeMap.get(row.store_id) ?? null,
    })),
    total: count ?? 0,
  };
}

export async function createStockAdjustment(input: {
  storeId: string;
  adjustmentDate: string;
  lines: StockAdjustmentLineInput[];
  note?: string;
  finalize?: boolean;
}): Promise<string> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  if (!input.lines.length) throw new Error("At least one line is required");

  for (const line of input.lines) {
    if (line.quantity <= 0) throw new Error("Quantity must be positive");
    if (line.direction === "add" && (!line.purchaseCost || line.purchaseCost <= 0)) {
      throw new Error("Purchase cost is required when adding stock");
    }
  }

  const linesJson: Json = input.lines.map((l) => ({
    product_id: l.productId,
    direction: l.direction,
    quantity: l.quantity,
    purchase_cost: l.direction === "remove" ? 0 : l.purchaseCost,
  })) as Json;

  const finalize = input.finalize ?? false;

  const { data, error } = await supabase.rpc("create_erp_stock_adjustment", {
    p_store_id: input.storeId,
    p_adjustment_date: input.adjustmentDate,
    p_lines: linesJson,
    p_note: input.note ?? undefined,
    p_finalize: false,
  });

  if (error) throw new Error(error.message);

  const adjustmentId = data as string;

  if (finalize) {
    await finalizeStockAdjustment(adjustmentId);
  }

  await logAuditEvent({
    action: finalize ? "finalize_stock_adjustment" : "stock_adjustment",
    entityType: "stock_adjustment",
    entityId: adjustmentId,
    description: finalize ? "Stock adjustment created and finalized" : "Stock adjustment created",
    storeId: input.storeId,
  });

  return adjustmentId;
}

export async function finalizeStockAdjustment(adjustmentId: string): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("finalize_erp_stock_adjustment", {
    p_adjustment_id: adjustmentId,
  });
  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "stock_adjustment",
    entityType: "stock_adjustment",
    entityId: adjustmentId,
    description: "Stock adjustment finalized",
  });
}

export async function getStockAdjustmentDetail(id: string) {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("erp_stock_adjustments")
    .select("*, stores(name), erp_stock_adjustment_lines(*)")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}
