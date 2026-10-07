import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type {
  ErpStoreTransferListRow,
  StoreTransferLineInput,
  TransferStatementLine,
} from "@/common/erp/inventory-types";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import { resolveErpStoreId } from "@/modules/erp/services/store-context.service";
import type { Json } from "@/lib/integrations/supabase/types";

function applyTransferStoreScope<T extends { or: (filter: string) => T; eq: (col: string, val: string) => T }>(
  query: T,
  activeStoreId: string | null,
  filters?: { fromStoreId?: string; toStoreId?: string },
): T {
  if (filters?.fromStoreId) return query.eq("from_store_id", filters.fromStoreId);
  if (filters?.toStoreId) return query.eq("to_store_id", filters.toStoreId);
  if (activeStoreId) {
    return query.or(`from_store_id.eq.${activeStoreId},to_store_id.eq.${activeStoreId}`);
  }
  return query;
}

export async function listStoreTransfers(
  page = 0,
  limit = 20,
  filters?: { fromStoreId?: string; toStoreId?: string; search?: string },
): Promise<{
  data: ErpStoreTransferListRow[];
  total: number;
}> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const from = page * limit;
  const activeStoreId = await resolveErpStoreId(
    filters?.fromStoreId ?? filters?.toStoreId ?? null,
  );

  let query = supabase
    .from("erp_store_transfers")
    .select(
      "id, transfer_number, from_store_id, to_store_id, transfer_date, status",
      { count: "exact" },
    )
    .order("transfer_date", { ascending: false })
    .range(from, from + limit - 1);

  query = applyTransferStoreScope(query, activeStoreId, filters);
  if (filters?.search?.trim()) {
    query = query.ilike("transfer_number", `%${filters.search.trim()}%`);
  }

  const { data, error, count } = await query;

  if (error) throw new Error(error.message);

  const storeIds = new Set<string>();
  for (const row of data ?? []) {
    storeIds.add(row.from_store_id);
    storeIds.add(row.to_store_id);
  }

  const storeMap = new Map<string, string>();
  if (storeIds.size > 0) {
    const { data: stores } = await supabase
      .from("stores")
      .select("id, name")
      .in("id", [...storeIds]);
    for (const s of stores ?? []) {
      storeMap.set(s.id, s.name);
    }
  }

  return {
    data: (data ?? []).map((row) => ({
      id: row.id,
      transfer_number: row.transfer_number,
      from_store_id: row.from_store_id,
      to_store_id: row.to_store_id,
      transfer_date: row.transfer_date,
      status: row.status,
      from_store_name: storeMap.get(row.from_store_id) ?? null,
      to_store_name: storeMap.get(row.to_store_id) ?? null,
    })),
    total: count ?? 0,
  };
}

export async function createStoreTransfer(input: {
  fromStoreId: string;
  toStoreId: string;
  transferDate: string;
  lines: StoreTransferLineInput[];
  note?: string;
  requestId?: string | null;
}): Promise<string> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const linesJson: Json = input.lines.map((l) => ({
    product_id: l.productId,
    quantity: l.quantity,
    purchase_price: l.purchasePrice ?? 0,
    sales_price: l.salesPrice ?? 0,
    markup_percent: l.markupPercent ?? 0,
    markup_type: l.markupType ?? "",
    markup_amount: l.markupAmount ?? 0,
    transfer_price: l.transferPrice,
  })) as Json;

  const { data, error } = await supabase.rpc("create_erp_store_transfer", {
    p_from_store_id: input.fromStoreId,
    p_to_store_id: input.toStoreId,
    p_transfer_date: input.transferDate,
    p_lines: linesJson,
    p_note: input.note ?? undefined,
    p_request_id: input.requestId ?? undefined,
  });

  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "create",
    entityType: "store_transfer",
    entityId: data as string,
    description: "Store transfer created",
    storeId: input.fromStoreId,
  });

  return data as string;
}

export async function approveStoreTransfer(transferId: string): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("approve_erp_store_transfer", {
    p_transfer_id: transferId,
  });
  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "update",
    entityType: "store_transfer",
    entityId: transferId,
    description: "Store transfer approved",
  });
}

export async function completeStoreTransfer(transferId: string): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("complete_erp_store_transfer", {
    p_transfer_id: transferId,
  });
  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "stock_transfer",
    entityType: "store_transfer",
    entityId: transferId,
    description: "Store transfer completed",
  });
}

export async function recordTransferPayment(input: {
  transferId: string;
  paymentDate: string;
  paymentMode: string;
  amount: number;
  accountId?: string | null;
  reference?: string;
  notes?: string;
}): Promise<string> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("record_erp_transfer_payment", {
    p_transfer_id: input.transferId,
    p_payment_date: input.paymentDate,
    p_payment_mode: input.paymentMode,
    p_amount: input.amount,
    p_account_id: input.accountId ?? undefined,
    p_reference: input.reference ?? undefined,
    p_notes: input.notes ?? undefined,
  });

  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "payment_received",
    entityType: "transfer_payment",
    entityId: data as string,
    description: `Transfer payment: ${input.amount}`,
  });

  return data as string;
}

export async function getStoreTransferDetail(id: string) {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("erp_store_transfers")
    .select("*, erp_store_transfer_lines(*), erp_transfer_payments(*)")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getTransferStatement(input: {
  fromStoreId: string;
  toStoreId?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
}): Promise<TransferStatementLine[]> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("get_transfer_statement", {
    p_from_store_id: input.fromStoreId,
    p_to_store_id: input.toStoreId ?? undefined,
    p_from_date: input.fromDate ?? undefined,
    p_to_date: input.toDate ?? undefined,
  });

  if (error) throw new Error(error.message);

  return ((data as unknown as TransferStatementLine[]) ?? []).map((row) => ({
    date: String(row.date),
    type: String(row.type),
    reference: String(row.reference),
    stock_out: Number(row.stock_out ?? 0),
    stock_in: Number(row.stock_in ?? 0),
    amount: Number(row.amount ?? 0),
    payments: Number(row.payments ?? 0),
  }));
}
