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

export type StockAdjustmentLineDetail = {
  id: string;
  adjustment_id: string;
  variant_id: string | null;
  product_id: string | null;
  direction: string;
  quantity: number;
  purchase_cost: number;
  line_total: number;
  product_name: string;
  variant_name: string | null;
  barcode: string | null;
};

export async function getStockAdjustmentDetail(id: string) {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("erp_stock_adjustments")
    .select("*, stores(name)")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);

  const { data: rawLines, error: linesError } = await supabase
    .from("erp_stock_adjustment_lines")
    .select(
      "id, adjustment_id, variant_id, product_id, direction, quantity, purchase_cost, line_total",
    )
    .eq("adjustment_id", id)
    .order("id", { ascending: true });
  if (linesError) throw new Error(linesError.message);

  const variantIds = [
    ...new Set(
      (rawLines ?? []).map((l) => l.variant_id).filter((vid): vid is string => vid != null),
    ),
  ];
  const productIds = [
    ...new Set(
      (rawLines ?? [])
        .map((l) => l.product_id)
        .filter((pid): pid is string => pid != null),
    ),
  ];

  const variantMap = new Map<
    string,
    { product_name: string; variant_name: string | null; barcode: string | null }
  >();
  const productMap = new Map<string, { product_name: string; barcode: string | null }>();

  const [variantsRes, productsRes] = await Promise.all([
    variantIds.length > 0
      ? supabase
          .from("product_variants")
          .select("id, name, barcode, products(name)")
          .in("id", variantIds)
      : Promise.resolve({
          data: [] as {
            id: string;
            name: string | null;
            barcode: string | null;
            products: { name: string } | null;
          }[],
        }),
    productIds.length > 0
      ? supabase.from("products").select("id, name, barcode").in("id", productIds)
      : Promise.resolve({ data: [] as { id: string; name: string | null; barcode: string | null }[] }),
  ]);

  for (const v of variantsRes.data ?? []) {
    const product = v.products as { name: string } | null;
    variantMap.set(v.id, {
      product_name: product?.name ?? "—",
      variant_name: v.name,
      barcode: v.barcode,
    });
  }
  for (const p of productsRes.data ?? []) {
    productMap.set(p.id, {
      product_name: p.name ?? "—",
      barcode: p.barcode,
    });
  }

  const erp_stock_adjustment_lines: StockAdjustmentLineDetail[] = (rawLines ?? []).map((line) => {
    const variant = line.variant_id ? variantMap.get(line.variant_id) : undefined;
    const product = line.product_id ? productMap.get(line.product_id) : undefined;
    return {
      id: line.id,
      adjustment_id: line.adjustment_id,
      variant_id: line.variant_id,
      product_id: line.product_id,
      direction: line.direction,
      quantity: Number(line.quantity ?? 0),
      purchase_cost: Number(line.purchase_cost ?? 0),
      line_total: Number(line.line_total ?? 0),
      product_name: variant?.product_name ?? product?.product_name ?? "—",
      variant_name: variant?.variant_name ?? null,
      barcode: variant?.barcode ?? product?.barcode ?? null,
    };
  });

  return { ...data, erp_stock_adjustment_lines };
}
