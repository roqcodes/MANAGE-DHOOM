import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { invokeRpc } from "@/lib/integrations/supabase/rpc";
import { resolveErpStoreId } from "@/modules/erp/services/store-context.service";

export type OnlineToPhysicalTransferRow = {
  id: string;
  transfer_number: string;
  store_id: string;
  notes: string | null;
  created_at: string;
  store_name: string | null;
  total_quantity: number;
  lines: {
    id: string;
    variant_id: string;
    variant_name: string | null;
    product_id: string;
    product_name: string;
    quantity: number;
  }[];
};

type TransferDbRow = {
  id: string;
  transfer_number: string;
  store_id: string;
  notes: string | null;
  created_at: string;
};

type TransferLineDbRow = {
  id: string;
  transfer_id: string;
  variant_id: string;
  product_id: string;
  quantity: number;
};

export async function listOnlineToPhysicalTransfers(input?: {
  storeId?: string;
  page?: number;
  limit?: number;
}): Promise<{ data: OnlineToPhysicalTransferRow[]; total: number }> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const storeId = input?.storeId
    ? await resolveErpStoreId(input.storeId)
    : undefined;
  const page = input?.page ?? 0;
  const limit = input?.limit ?? 50;
  const from = page * limit;

  // Tables added in 20260908180000 — cast until generated types are refreshed.
  const untypedDb = supabase as unknown as {
    from: (table: string) => ReturnType<typeof supabase.from>;
  };

  let transferQuery = untypedDb
    .from("online_to_physical_transfers")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + limit - 1);

  if (storeId) transferQuery = transferQuery.eq("store_id", storeId);

  const { data: transferRows, error, count } = await transferQuery;
  if (error) throw new Error(error.message);

  const typedTransfers = (transferRows ?? []) as TransferDbRow[];
  const transferIds = typedTransfers.map((r) => r.id);
  const storeIds = [...new Set(typedTransfers.map((r) => r.store_id))];
  const storeMap = new Map<string, string>();
  const linesMap = new Map<string, OnlineToPhysicalTransferRow["lines"]>();

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
    const { data: lineRows } = await untypedDb
      .from("online_to_physical_transfer_lines")
      .select("id, transfer_id, variant_id, product_id, quantity")
      .in("transfer_id", transferIds);

    const typedLines = (lineRows ?? []) as TransferLineDbRow[];
    const variantIds = [...new Set(typedLines.map((l) => l.variant_id))];
    const productIds = [...new Set(typedLines.map((l) => l.product_id))];
    const variantNameMap = new Map<string, string | null>();
    const productNameMap = new Map<string, string>();

    if (variantIds.length > 0) {
      const { data: variants } = await supabase
        .from("product_variants")
        .select("id, name")
        .in("id", variantIds);
      for (const v of variants ?? []) {
        variantNameMap.set(v.id, v.name);
      }
    }

    if (productIds.length > 0) {
      const { data: products } = await supabase
        .from("products")
        .select("id, name")
        .in("id", productIds);
      for (const p of products ?? []) {
        productNameMap.set(p.id, p.name ?? "Product");
      }
    }

    for (const line of typedLines) {
      const list = linesMap.get(line.transfer_id) ?? [];
      list.push({
        id: line.id,
        variant_id: line.variant_id,
        variant_name: variantNameMap.get(line.variant_id) ?? null,
        product_id: line.product_id,
        product_name: productNameMap.get(line.product_id) ?? "Product",
        quantity: Number(line.quantity),
      });
      linesMap.set(line.transfer_id, list);
    }
  }

  const rows: OnlineToPhysicalTransferRow[] = typedTransfers.map((row) => {
    const lines = linesMap.get(row.id) ?? [];
    const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
    return {
      id: row.id,
      transfer_number: row.transfer_number,
      store_id: row.store_id,
      notes: row.notes,
      created_at: row.created_at,
      store_name: storeMap.get(row.store_id) ?? null,
      total_quantity: totalQuantity,
      lines,
    };
  });

  return { data: rows, total: count ?? 0 };
}

export async function createOnlineToPhysicalTransfer(input: {
  storeId?: string;
  notes?: string | null;
  lines: { variantId: string; quantity: number }[];
}): Promise<string> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const storeId = await resolveErpStoreId(input.storeId);

  const lines = input.lines.filter((line) => line.variantId && line.quantity > 0);
  if (lines.length === 0) {
    throw new Error("At least one transfer line is required");
  }

  const { data, error } = await invokeRpc(supabase, "create_online_to_physical_transfer", {
    p_store_id: storeId,
    p_lines: lines.map((line) => ({
      variantId: line.variantId,
      quantity: Math.floor(line.quantity),
    })),
    p_notes: input.notes ?? null,
  });

  if (error) throw new Error(error.message);
  return data as string;
}
