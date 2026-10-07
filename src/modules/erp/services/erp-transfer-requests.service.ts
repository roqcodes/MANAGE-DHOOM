import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type {
  ErpTransferRequestListRow,
  TransferRequestLineInput,
} from "@/common/erp/inventory-types";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import { resolveErpStoreId } from "@/modules/erp/services/store-context.service";
import type { Json } from "@/lib/integrations/supabase/types";

export async function listTransferRequests(
  page = 0,
  limit = 20,
  filters?: { fromStoreId?: string; toStoreId?: string; search?: string; status?: string },
): Promise<{
  data: ErpTransferRequestListRow[];
  total: number;
}> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const from = page * limit;
  const activeStoreId = await resolveErpStoreId(
    filters?.fromStoreId ?? filters?.toStoreId ?? null,
  );

  let query = supabase
    .from("erp_transfer_requests")
    .select("id, request_number, from_store_id, to_store_id, request_date, status", { count: "exact" })
    .order("request_date", { ascending: false })
    .range(from, from + limit - 1);

  if (filters?.fromStoreId) query = query.eq("from_store_id", filters.fromStoreId);
  else if (filters?.toStoreId) query = query.eq("to_store_id", filters.toStoreId);
  else if (activeStoreId) {
    query = query.or(`from_store_id.eq.${activeStoreId},to_store_id.eq.${activeStoreId}`);
  }
  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.search?.trim()) {
    query = query.ilike("request_number", `%${filters.search.trim()}%`);
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
    const { data: stores } = await supabase.from("stores").select("id, name").in("id", [...storeIds]);
    for (const s of stores ?? []) storeMap.set(s.id, s.name);
  }

  return {
    data: (data ?? []).map((row) => ({
      id: row.id,
      request_number: row.request_number,
      from_store_id: row.from_store_id,
      to_store_id: row.to_store_id,
      request_date: row.request_date,
      status: row.status,
      from_store_name: storeMap.get(row.from_store_id) ?? null,
      to_store_name: storeMap.get(row.to_store_id) ?? null,
    })),
    total: count ?? 0,
  };
}

export async function createTransferRequest(input: {
  fromStoreId: string;
  toStoreId: string;
  requestDate: string;
  lines: TransferRequestLineInput[];
  note?: string;
  submit?: boolean;
}): Promise<string> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const linesJson: Json = input.lines.map((l) => ({
    product_id: l.productId,
    quantity: l.quantity,
    source_available: l.sourceAvailable ?? 0,
    transfer_price: l.transferPrice ?? 0,
    sales_price: l.salesPrice ?? 0,
    average_purchase_cost: l.averagePurchaseCost ?? 0,
    note: l.note ?? "",
  })) as Json;

  const { data, error } = await supabase.rpc("create_erp_transfer_request", {
    p_from_store_id: input.fromStoreId,
    p_to_store_id: input.toStoreId,
    p_request_date: input.requestDate,
    p_lines: linesJson,
    p_note: input.note ?? undefined,
    p_submit: input.submit ?? false,
  });

  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "create",
    entityType: "transfer_request",
    entityId: data as string,
    description: "Transfer request created",
    storeId: input.fromStoreId,
  });

  return data as string;
}

export async function getTransferRequestDetail(id: string) {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("erp_transfer_requests")
    .select(
      "*, erp_transfer_request_lines(*, products(id, name, barcode))",
    )
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function approveTransferRequest(requestId: string): Promise<string> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc(
    "approve_erp_transfer_request" as "create_erp_transfer_request",
    { p_request_id: requestId } as never,
  );
  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "approve",
    entityType: "transfer_request",
    entityId: requestId,
    description: "Transfer request approved and stock moved",
  });

  return data as string;
}

export async function rejectTransferRequest(requestId: string): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc(
    "reject_erp_transfer_request" as "create_erp_transfer_request",
    { p_request_id: requestId } as never,
  );
  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "reject",
    entityType: "transfer_request",
    entityId: requestId,
    description: "Transfer request rejected",
  });
}
