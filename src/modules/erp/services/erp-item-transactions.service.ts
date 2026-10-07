import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type { ItemTransactionRow } from "@/common/erp/inventory-types";
import { resolveErpStoreId } from "@/modules/erp/services/store-context.service";

export interface ItemTransactionFilters {
  storeId?: string;
  type?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export async function listItemTransactions(
  filters: ItemTransactionFilters = {},
): Promise<{ data: ItemTransactionRow[]; total: number }> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const page = filters.page ?? 0;
  const limit = filters.limit ?? 50;
  const from = page * limit;
  const storeId = await resolveErpStoreId(filters.storeId);

  let dataQuery = supabase
    .from("stock_movements")
    .select(
      "id, created_at, store_id, transfer_store_id, type, variant_id, quantity, transaction_price, balance_after, reference_id, reference_type, reason",
    )
    .order("created_at", { ascending: false })
    .range(from, from + limit - 1);

  let countQuery = supabase
    .from("stock_movements")
    .select("id", { count: "exact", head: true });

  if (storeId) {
    dataQuery = dataQuery.eq("store_id", storeId);
    countQuery = countQuery.eq("store_id", storeId);
  }
  if (filters.type && filters.type !== "all") {
    dataQuery = dataQuery.eq("type", filters.type);
    countQuery = countQuery.eq("type", filters.type);
  }
  if (filters.dateFrom) {
    const fromTs = `${filters.dateFrom}T00:00:00`;
    dataQuery = dataQuery.gte("created_at", fromTs);
    countQuery = countQuery.gte("created_at", fromTs);
  }
  if (filters.dateTo) {
    const toTs = `${filters.dateTo}T23:59:59`;
    dataQuery = dataQuery.lte("created_at", toTs);
    countQuery = countQuery.lte("created_at", toTs);
  }

  const [dataResult, countResult] = await Promise.all([dataQuery, countQuery]);
  if (dataResult.error) throw new Error(dataResult.error.message);
  if (countResult.error) throw new Error(countResult.error.message);

  const data = dataResult.data;
  const count = countResult.count;

  const variantIds = [...new Set((data ?? []).map((r) => r.variant_id))];
  const storeIds = new Set<string>();
  for (const row of data ?? []) {
    if (row.store_id) storeIds.add(row.store_id);
    if (row.transfer_store_id) storeIds.add(row.transfer_store_id);
  }

  const variantMap = new Map<string, { product_name: string; variant_name: string | null; barcode: string | null }>();
  const storeMap = new Map<string, string>();
  const invoiceMap = new Map<string, string>();

  const invoiceIds = (data ?? [])
    .filter((r) => r.reference_type === "invoice" && r.reference_id)
    .map((r) => r.reference_id as string);

  const [variantsRes, storesRes, invoicesRes] = await Promise.all([
    variantIds.length > 0
      ? supabase
          .from("product_variants")
          .select("id, name, barcode, products(name)")
          .in("id", variantIds)
      : Promise.resolve({ data: [] as { id: string; name: string | null; barcode: string | null; products: { name: string } | null }[] }),
    storeIds.size > 0
      ? supabase.from("stores").select("id, name").in("id", [...storeIds])
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    invoiceIds.length > 0
      ? supabase.from("invoices").select("id, invoice_number").in("id", invoiceIds)
      : Promise.resolve({ data: [] as { id: string; invoice_number: string }[] }),
  ]);

  for (const v of variantsRes.data ?? []) {
    const product = v.products as { name: string } | null;
    variantMap.set(v.id, {
      product_name: product?.name ?? "—",
      variant_name: v.name,
      barcode: v.barcode,
    });
  }
  for (const s of storesRes.data ?? []) storeMap.set(s.id, s.name);
  for (const inv of invoicesRes.data ?? []) invoiceMap.set(inv.id, inv.invoice_number);

  let rows: ItemTransactionRow[] = (data ?? []).map((row) => {
    const variant = variantMap.get(row.variant_id);
    return {
      id: row.id,
      created_at: row.created_at,
      store_id: row.store_id,
      store_name: row.store_id ? (storeMap.get(row.store_id) ?? null) : null,
      transfer_store_id: row.transfer_store_id,
      transfer_store_name: row.transfer_store_id
        ? (storeMap.get(row.transfer_store_id) ?? null)
        : null,
      type: row.type,
      variant_id: row.variant_id,
      product_name: variant?.product_name ?? "—",
      variant_name: variant?.variant_name ?? null,
      barcode: variant?.barcode ?? null,
      quantity: Number(row.quantity ?? 0),
      transaction_price: row.transaction_price != null ? Number(row.transaction_price) : null,
      balance_after: row.balance_after != null ? Number(row.balance_after) : null,
      reference_id: row.reference_id,
      reference_type: row.reference_type,
      reason: row.reason,
      invoice_number:
        row.reference_type === "invoice" && row.reference_id
          ? (invoiceMap.get(row.reference_id) ?? null)
          : null,
    };
  });

  if (filters.search?.trim()) {
    const s = filters.search.trim().toLowerCase();
    rows = rows.filter(
      (r) =>
        r.product_name.toLowerCase().includes(s) ||
        (r.variant_name?.toLowerCase().includes(s) ?? false) ||
        (r.barcode?.toLowerCase().includes(s) ?? false) ||
        (r.invoice_number?.toLowerCase().includes(s) ?? false) ||
        r.type.toLowerCase().includes(s),
    );
  }

  return { data: rows, total: count ?? 0 };
}
