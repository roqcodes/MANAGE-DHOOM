import "server-only";

import { randomUUID } from "crypto";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type {
  ErpTransferPaymentListRow,
  PendingTransferPaymentRow,
} from "@/common/erp/inventory-types";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import { resolveErpStoreId } from "@/modules/erp/services/store-context.service";
import { getTransferStatement } from "@/modules/erp/services/erp-store-transfers.service";
import type { TransferStatementSummary } from "@/common/erp/inventory-types";

const BULK_REF_PREFIX = "BULK:";

export async function listTransferPayments(options?: {
  page?: number;
  limit?: number;
  fromStoreId?: string;
  toStoreId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}): Promise<{ data: ErpTransferPaymentListRow[]; total: number }> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const page = options?.page ?? 0;
  const limit = options?.limit ?? 50;
  const from = page * limit;
  const activeStoreId = await resolveErpStoreId(
    options?.fromStoreId ?? options?.toStoreId ?? null,
  );

  let query = supabase
    .from("erp_transfer_payments")
    .select(
      "id, payment_number, transfer_id, from_store_id, to_store_id, payment_date, payment_mode, amount, reference, notes",
      { count: "exact" },
    )
    .order("payment_date", { ascending: false })
    .range(from, from + limit - 1);

  if (options?.fromStoreId) query = query.eq("from_store_id", options.fromStoreId);
  else if (options?.toStoreId) query = query.eq("to_store_id", options.toStoreId);
  else if (activeStoreId) {
    query = query.or(`from_store_id.eq.${activeStoreId},to_store_id.eq.${activeStoreId}`);
  }
  if (options?.dateFrom) query = query.gte("payment_date", options.dateFrom);
  if (options?.dateTo) query = query.lte("payment_date", options.dateTo);
  if (options?.search?.trim()) {
    const s = options.search.trim();
    query = query.or(`payment_number.ilike.%${s}%,reference.ilike.%${s}%`);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const storeIds = new Set<string>();
  const transferIds = new Set<string>();
  for (const row of data ?? []) {
    storeIds.add(row.from_store_id);
    storeIds.add(row.to_store_id);
    transferIds.add(row.transfer_id);
  }
  const storeMap = new Map<string, string>();
  if (storeIds.size > 0) {
    const { data: stores } = await supabase.from("stores").select("id, name").in("id", [...storeIds]);
    for (const s of stores ?? []) storeMap.set(s.id, s.name);
  }
  const transferMap = new Map<string, string>();
  if (transferIds.size > 0) {
    const { data: transfers } = await supabase
      .from("erp_store_transfers")
      .select("id, transfer_number")
      .in("id", [...transferIds]);
    for (const t of transfers ?? []) transferMap.set(t.id, t.transfer_number);
  }

  return {
    data: (data ?? []).map((row) => ({
      id: row.id,
      payment_number: row.payment_number,
      transfer_id: row.transfer_id,
      transfer_number: transferMap.get(row.transfer_id) ?? null,
      from_store_id: row.from_store_id,
      to_store_id: row.to_store_id,
      from_store_name: storeMap.get(row.from_store_id) ?? null,
      to_store_name: storeMap.get(row.to_store_id) ?? null,
      payment_date: row.payment_date,
      payment_mode: row.payment_mode,
      amount: Number(row.amount ?? 0),
      reference: row.reference,
      notes: row.notes,
    })),
    total: count ?? 0,
  };
}

export async function listPendingTransferPayments(options?: {
  fromStoreId?: string;
  toStoreId?: string;
}): Promise<PendingTransferPaymentRow[]> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("erp_store_transfers")
    .select("id, transfer_number, transfer_date, from_store_id, to_store_id, status")
    .in("status", ["approved", "in_transit", "completed"]);

  if (options?.fromStoreId) query = query.eq("from_store_id", options.fromStoreId);
  if (options?.toStoreId) query = query.eq("to_store_id", options.toStoreId);

  const { data, error } = await query.order("transfer_date", { ascending: false });
  if (error) throw new Error(error.message);

  const transferIds = (data ?? []).map((t) => t.id);
  const totalsMap = new Map<string, number>();
  const paidMap = new Map<string, number>();

  if (transferIds.length > 0) {
    const { data: lines } = await supabase
      .from("erp_store_transfer_lines")
      .select("transfer_id, line_total")
      .in("transfer_id", transferIds);
    for (const line of lines ?? []) {
      totalsMap.set(
        line.transfer_id,
        (totalsMap.get(line.transfer_id) ?? 0) + Number(line.line_total ?? 0),
      );
    }

    const { data: payments } = await supabase
      .from("erp_transfer_payments")
      .select("transfer_id, amount")
      .in("transfer_id", transferIds);
    for (const p of payments ?? []) {
      paidMap.set(p.transfer_id, (paidMap.get(p.transfer_id) ?? 0) + Number(p.amount ?? 0));
    }
  }

  const storeIds = new Set<string>();
  for (const t of data ?? []) {
    storeIds.add(t.from_store_id);
    storeIds.add(t.to_store_id);
  }
  const storeMap = new Map<string, string>();
  if (storeIds.size > 0) {
    const { data: stores } = await supabase.from("stores").select("id, name").in("id", [...storeIds]);
    for (const s of stores ?? []) storeMap.set(s.id, s.name);
  }

  return (data ?? [])
    .map((t) => {
      const total = totalsMap.get(t.id) ?? 0;
      const paid = paidMap.get(t.id) ?? 0;
      const balance = total - paid;
      return {
        transfer_id: t.id,
        transfer_number: t.transfer_number,
        transfer_date: t.transfer_date,
        from_store_id: t.from_store_id,
        to_store_id: t.to_store_id,
        from_store_name: storeMap.get(t.from_store_id) ?? null,
        to_store_name: storeMap.get(t.to_store_id) ?? null,
        total_amount: total,
        amount_paid: paid,
        balance_due: balance,
        status: t.status,
      };
    })
    .filter((r) => r.balance_due > 0.01);
}

export async function createBulkTransferPayment(input: {
  paymentDate: string;
  paymentMode: string;
  accountId?: string | null;
  reference?: string;
  notes?: string;
  allocations: Array<{ transferId: string; amount: number }>;
}): Promise<{ reference: string; paymentIds: string[]; idempotent: boolean }> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const batchRef = input.reference ?? `${BULK_REF_PREFIX}${randomUUID()}`;

  const allocationsJson = input.allocations
    .filter((a) => a.amount > 0)
    .map((a) => ({ transfer_id: a.transferId, amount: a.amount }));

  if (allocationsJson.length === 0) {
    throw new Error("At least one allocation with positive amount is required");
  }

  const { data, error } = await supabase.rpc("record_erp_transfer_bulk_payment", {
    p_payment_date: input.paymentDate,
    p_payment_mode: input.paymentMode,
    p_allocations: allocationsJson,
    p_account_id: input.accountId ?? undefined,
    p_reference: batchRef,
    p_notes: input.notes ?? undefined,
  });

  if (error) throw new Error(error.message);

  const result = data as {
    reference: string;
    payment_ids: string[];
    idempotent: boolean;
  };

  if (!result.idempotent) {
    await logAuditEvent({
      action: "payment_received",
      entityType: "transfer_payment_bulk",
      description: `Bulk transfer payment: ${result.payment_ids.length} allocations`,
      metadata: { batchRef: result.reference, paymentIds: result.payment_ids },
    });
  }

  return {
    reference: result.reference,
    paymentIds: result.payment_ids ?? [],
    idempotent: result.idempotent ?? false,
  };
}

export async function getTransferStatementSummary(input: {
  fromStoreId: string;
  toStoreId?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
}): Promise<TransferStatementSummary> {
  const lines = await getTransferStatement(input);

  let totalStockOut = 0;
  let totalStockIn = 0;
  let totalAmount = 0;
  let totalPayments = 0;

  for (const line of lines) {
    totalStockOut += line.stock_out;
    totalStockIn += line.stock_in;
    totalAmount += line.amount;
    totalPayments += line.payments;
  }

  const paymentBalance = totalAmount - totalPayments;

  return {
    openingBalance: 0,
    totalStockOut,
    totalStockIn,
    totalAmount,
    totalPayments,
    paymentBalance,
    lines,
  };
}
