import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type {
  ErpOpeningStockListRow,
  OpeningStockLineInput,
  OpeningStockWorksheetPayload,
} from "@/common/erp/inventory-types";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import { resolveErpStoreId } from "@/modules/erp/services/store-context.service";
import type { Json } from "@/lib/integrations/supabase/types";
import type { ErpDocumentCreateOutcome } from "@/common/erp/document-create-outcome";

export async function listOpeningStocks(
  page = 0,
  limit = 20,
  filters?: { storeId?: string; search?: string },
): Promise<{
  data: ErpOpeningStockListRow[];
  total: number;
}> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const from = page * limit;
  const activeStoreId = await resolveErpStoreId(filters?.storeId);

  let query = supabase
    .from("erp_opening_stocks")
    .select(
      "id, opening_number, store_id, opening_date, status, total_value, created_at, updated_at",
      { count: "exact" },
    )
    .order("opening_date", { ascending: false })
    .order("updated_at", { ascending: false })
    .range(from, from + limit - 1);

  if (activeStoreId) query = query.eq("store_id", activeStoreId);
  if (filters?.search?.trim()) {
    query = query.ilike("opening_number", `%${filters.search.trim()}%`);
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
      opening_number: row.opening_number,
      store_id: row.store_id,
      opening_date: row.opening_date,
      status: row.status,
      total_value: Number(row.total_value ?? 0),
      store_name: storeMap.get(row.store_id) ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    })),
    total: count ?? 0,
  };
}

export async function createOpeningStock(input: {
  storeId: string;
  lines: OpeningStockLineInput[];
  note?: string;
  finalize?: boolean;
}): Promise<ErpDocumentCreateOutcome> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  if (!input.lines.length) throw new Error("At least one line is required");

  for (const line of input.lines) {
    if (line.quantity <= 0) throw new Error("Quantity must be positive");
    if (!line.unitCost || line.unitCost <= 0) {
      throw new Error("Unit cost is required for opening stock");
    }
  }

  const linesJson: Json = input.lines.map((l) => ({
    product_id: l.productId,
    quantity: l.quantity,
    unit_cost: l.unitCost,
  })) as Json;

  const finalize = input.finalize ?? false;

  const { data, error } = await supabase.rpc("create_erp_opening_stock", {
    p_store_id: input.storeId,
    p_opening_date: new Date().toISOString().slice(0, 10),
    p_lines: linesJson,
    p_note: input.note ?? undefined,
    p_finalize: false,
  });

  if (error) throw new Error(error.message);

  const openingId = data as string;

  if (finalize) {
    try {
      await finalizeOpeningStock(openingId);
    } catch (error) {
      const finalizeError =
        error instanceof Error ? error.message : "Finalization failed";
      await logAuditEvent({
        action: "opening_stock",
        entityType: "opening_stock",
        entityId: openingId,
        description: "Opening stock draft created; finalization failed",
        storeId: input.storeId,
      });
      return {
        documentId: openingId,
        finalized: false,
        finalizeFailed: true,
        finalizeError,
      };
    }
  }

  await logAuditEvent({
    action: finalize ? "finalize_opening_stock" : "opening_stock",
    entityType: "opening_stock",
    entityId: openingId,
    description: finalize ? "Opening stock created and finalized" : "Opening stock created",
    storeId: input.storeId,
  });

  return { documentId: openingId, finalized: finalize };
}

export async function finalizeOpeningStock(openingId: string): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("finalize_erp_opening_stock", {
    p_opening_id: openingId,
  });
  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "opening_stock",
    entityType: "opening_stock",
    entityId: openingId,
    description: "Opening stock finalized",
  });
}

export type OpeningStockLineDetail = {
  id: string;
  opening_id: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
  line_total: number;
  product_name: string;
  barcode: string | null;
};

export async function getOpeningStockDetail(id: string) {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("erp_opening_stocks")
    .select("*, stores(name)")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);

  const { data: rawLines, error: linesError } = await supabase
    .from("erp_opening_stock_lines")
    .select("id, opening_id, product_id, quantity, unit_cost, line_total")
    .eq("opening_id", id);
  if (linesError) throw new Error(linesError.message);

  const productIds = [...new Set((rawLines ?? []).map((l) => l.product_id))];
  const productMap = new Map<string, { name: string; barcode: string | null }>();
  if (productIds.length > 0) {
    const { data: products } = await supabase
      .from("products")
      .select("id, name, barcode")
      .in("id", productIds);
    for (const p of products ?? []) {
      productMap.set(p.id, { name: p.name ?? "—", barcode: p.barcode });
    }
  }

  const erp_opening_stock_lines: OpeningStockLineDetail[] = (rawLines ?? []).map((line) => {
    const product = productMap.get(line.product_id);
    return {
      id: line.id,
      opening_id: line.opening_id,
      product_id: line.product_id,
      quantity: Number(line.quantity),
      unit_cost: Number(line.unit_cost),
      line_total: Number(line.line_total),
      product_name: product?.name ?? "—",
      barcode: product?.barcode ?? null,
    };
  });

  return { ...data, erp_opening_stock_lines };
}

export async function getOpeningStockWorksheet(
  storeId: string,
  search?: string,
): Promise<OpeningStockWorksheetPayload> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_erp_opening_stock_worksheet", {
    p_store_id: storeId,
    p_search: search?.trim() || undefined,
  });
  if (error) throw new Error(error.message);
  const payload = data as unknown as OpeningStockWorksheetPayload;
  return {
    pending: payload?.pending ?? [],
    recorded: payload?.recorded ?? [],
  };
}

export async function saveOpeningStockWorksheet(input: {
  storeId: string;
  pending?: Array<{ productId: string; quantity: number; unitCost: number }>;
  updates?: Array<{
    productId: string;
    openingId: string;
    lineId: string;
    quantity: number;
    unitCost: number;
  }>;
}) {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const pendingJson: Json =
    (input.pending ?? [])
      .filter((l) => l.quantity > 0 && l.unitCost > 0)
      .map((l) => ({
        product_id: l.productId,
        quantity: l.quantity,
        unit_cost: l.unitCost,
      })) as Json;

  const updatesJson: Json =
    (input.updates ?? [])
      .filter((l) => l.quantity > 0 && l.unitCost > 0)
      .map((l) => ({
        opening_id: l.openingId,
        line_id: l.lineId,
        product_id: l.productId,
        quantity: l.quantity,
        unit_cost: l.unitCost,
      })) as Json;

  const { data, error } = await supabase.rpc("save_erp_opening_stock_worksheet", {
    p_store_id: input.storeId,
    p_opening_date: new Date().toISOString().slice(0, 10),
    p_pending: pendingJson,
    p_updates: updatesJson,
  });
  if (error) throw new Error(error.message);
  return data as { saved_pending: number; updated: number; opening_document_id?: string };
}

export async function saveOpeningStockLine(input: {
  storeId: string;
  productId: string;
  quantity: number;
  unitCost: number;
  openingId?: string;
  lineId?: string;
}) {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("save_erp_opening_stock_line", {
    p_store_id: input.storeId,
    p_opening_date: new Date().toISOString().slice(0, 10),
    p_product_id: input.productId,
    p_quantity: input.quantity,
    p_unit_cost: input.unitCost,
    p_opening_id: input.openingId ?? undefined,
    p_line_id: input.lineId ?? undefined,
  });
  if (error) throw new Error(error.message);
  return data as { mode: string; opening_id: string; line_id?: string; product_id: string };
}