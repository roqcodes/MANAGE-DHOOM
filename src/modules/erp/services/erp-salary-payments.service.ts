import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type {
  ErpSalaryBulkPaymentListRow,
  ErpSalaryPaymentDetail,
  ErpSalaryPaymentListRow,
} from "@/common/erp/hr-types";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import { listPaidThroughAccounts } from "@/modules/erp/services/erp-supplier-payments.service";
import {
  requireErpStoreId,
  resolveErpStoreId,
} from "@/modules/erp/services/store-context.service";
import type { Json } from "@/lib/integrations/supabase/types";

type SalaryPaymentListFilters = {
  page?: number;
  limit?: number;
  storeId?: string;
  period?: string;
  search?: string;
};

function periodToDateRange(period?: string): { dateFrom?: string; dateTo?: string } {
  if (!period || period === "all") return {};
  const now = new Date();
  if (period === "this_month") {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
    return {
      dateFrom: `${y}-${m}-01`,
      dateTo: `${y}-${m}-${String(lastDay).padStart(2, "0")}`,
    };
  }
  if (period === "this_quarter") {
    const quarter = Math.floor(now.getMonth() / 3);
    const startMonth = quarter * 3 + 1;
    const endMonth = startMonth + 2;
    const y = now.getFullYear();
    const lastDay = new Date(y, endMonth, 0).getDate();
    return {
      dateFrom: `${y}-${String(startMonth).padStart(2, "0")}-01`,
      dateTo: `${y}-${String(endMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
    };
  }
  return {};
}

const PAYMENT_SELECT =
  "id, payment_number, employee_id, store_id, payment_date, payment_mode, total_paid_amount, salary_payment_amount, advance_payment_amount, advance_recovery_amount, advance_balance_after, bulk_payment_id, notes, created_at, erp_employees(full_name), stores(name), accounts!erp_salary_payments_paid_through_account_id_fkey(name)";

function mapPaymentRow(row: Record<string, unknown>): ErpSalaryPaymentListRow {
  const employee = row.erp_employees as { full_name: string } | null;
  const store = row.stores as { name: string } | null;
  const account = row.accounts as { name: string } | null;
  return {
    id: row.id as string,
    payment_number: row.payment_number as string,
    employee_id: row.employee_id as string,
    employee_name: employee?.full_name ?? null,
    store_id: row.store_id as string,
    store_name: store?.name ?? null,
    payment_date: row.payment_date as string,
    total_paid_amount: Number(row.total_paid_amount ?? 0),
    salary_payment_amount: Number(row.salary_payment_amount ?? 0),
    advance_payment_amount: Number(row.advance_payment_amount ?? 0),
    advance_balance_after: Number(row.advance_balance_after ?? 0),
    payment_mode: row.payment_mode as string,
    paid_through_name: account?.name ?? null,
    bulk_payment_id: (row.bulk_payment_id as string | null) ?? null,
  };
}

export async function listSalaryPayments(
  filters: SalaryPaymentListFilters = {},
): Promise<{
  data: ErpSalaryPaymentListRow[];
  total: number;
  totals: {
    totalPaid: number;
    salaryPayment: number;
    advancePayment: number;
    advanceBalance: number;
  };
}> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const page = filters.page ?? 0;
  const limit = filters.limit ?? 20;
  const from = page * limit;
  const storeId = await resolveErpStoreId(filters.storeId);
  const { dateFrom, dateTo } = periodToDateRange(filters.period);

  let query = supabase
    .from("erp_salary_payments")
    .select(PAYMENT_SELECT, { count: "exact" })
    .is("bulk_payment_id", null)
    .order("payment_date", { ascending: false })
    .range(from, from + limit - 1);

  if (storeId) query = query.eq("store_id", storeId);
  if (dateFrom) query = query.gte("payment_date", dateFrom);
  if (dateTo) query = query.lte("payment_date", dateTo);

  if (filters.search?.trim()) {
    const s = filters.search.trim();
    const { data: empMatches } = await supabase
      .from("erp_employees")
      .select("id")
      .ilike("full_name", `%${s}%`)
      .limit(50);
    const empIds = (empMatches ?? []).map((e) => e.id);
    const orParts = [`payment_number.ilike.%${s}%`];
    if (empIds.length > 0) orParts.push(`employee_id.in.(${empIds.join(",")})`);
    query = query.or(orParts.join(","));
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  let summaryQuery = supabase
    .from("erp_salary_payments")
    .select("total_paid_amount, salary_payment_amount, advance_payment_amount, advance_balance_after")
    .is("bulk_payment_id", null);
  if (storeId) summaryQuery = summaryQuery.eq("store_id", storeId);
  if (dateFrom) summaryQuery = summaryQuery.gte("payment_date", dateFrom);
  if (dateTo) summaryQuery = summaryQuery.lte("payment_date", dateTo);
  const { data: summaryRows, error: summaryErr } = await summaryQuery;
  if (summaryErr) throw new Error(summaryErr.message);

  const totals = (summaryRows ?? []).reduce(
    (acc, row) => ({
      totalPaid: acc.totalPaid + Number(row.total_paid_amount ?? 0),
      salaryPayment: acc.salaryPayment + Number(row.salary_payment_amount ?? 0),
      advancePayment: acc.advancePayment + Number(row.advance_payment_amount ?? 0),
      advanceBalance: acc.advanceBalance + Number(row.advance_balance_after ?? 0),
    }),
    { totalPaid: 0, salaryPayment: 0, advancePayment: 0, advanceBalance: 0 },
  );

  return {
    data: (data ?? []).map((row) => mapPaymentRow(row as Record<string, unknown>)),
    total: count ?? 0,
    totals,
  };
}

export async function getSalaryPaymentDetail(id: string): Promise<ErpSalaryPaymentDetail> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("erp_salary_payments")
    .select(PAYMENT_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Salary payment not found");

  const base = mapPaymentRow(data as Record<string, unknown>);
  return {
    ...base,
    advance_recovery_amount: Number(data.advance_recovery_amount ?? 0),
    notes: (data.notes as string | null) ?? null,
    created_at: data.created_at as string,
  };
}

export async function createSalaryPayment(input: {
  employeeId: string;
  storeId: string;
  paymentDate: string;
  totalPaid: number;
  paymentMode?: string;
  paidThroughAccountId?: string;
  notes?: string;
}): Promise<string> {
  const profile = await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const storeId = await requireErpStoreId(input.storeId);

  const { data, error } = await supabase.rpc("record_erp_salary_payment", {
    p_employee_id: input.employeeId,
    p_store_id: storeId,
    p_payment_date: input.paymentDate,
    p_total_paid: input.totalPaid,
    p_payment_mode: input.paymentMode ?? "Cash",
    p_paid_through_account_id: input.paidThroughAccountId ?? null,
    p_advance_recovery: 0,
    p_notes: input.notes ?? null,
    p_bulk_payment_id: null,
    p_created_by: profile.id,
  });

  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "create",
    entityType: "salary_payment",
    entityId: data as string,
    description: `Salary payment ${input.totalPaid}`,
  });

  return data as string;
}

export async function deleteSalaryPayment(id: string): Promise<void> {
  const profile = await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("delete_erp_salary_payment", {
    p_payment_id: id,
    p_actor: profile.id,
  });

  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "delete",
    entityType: "salary_payment",
    entityId: id,
    description: "Deleted salary payment",
  });
}

export async function listSalaryBulkPayments(
  filters: SalaryPaymentListFilters = {},
): Promise<{ data: ErpSalaryBulkPaymentListRow[]; total: number }> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const page = filters.page ?? 0;
  const limit = filters.limit ?? 20;
  const from = page * limit;
  const storeId = await resolveErpStoreId(filters.storeId);
  const { dateFrom, dateTo } = periodToDateRange(filters.period);

  let query = supabase
    .from("erp_salary_bulk_payments")
    .select(
      "id, bulk_number, store_id, payment_date, payment_mode, total_amount, notes, reference, stores(name), accounts!erp_salary_bulk_payments_paid_through_account_id_fkey(name)",
      { count: "exact" },
    )
    .order("payment_date", { ascending: false })
    .range(from, from + limit - 1);

  if (storeId) query = query.eq("store_id", storeId);
  if (dateFrom) query = query.gte("payment_date", dateFrom);
  if (dateTo) query = query.lte("payment_date", dateTo);
  if (filters.search?.trim()) {
    query = query.ilike("bulk_number", `%${filters.search.trim()}%`);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  return {
    data: (data ?? []).map((row) => {
      const store = row.stores as { name: string } | null;
      const account = row.accounts as { name: string } | null;
      return {
        id: row.id,
        bulk_number: row.bulk_number,
        store_id: row.store_id,
        store_name: store?.name ?? null,
        payment_date: row.payment_date,
        payment_mode: row.payment_mode,
        paid_through_name: account?.name ?? null,
        total_amount: Number(row.total_amount ?? 0),
        notes: row.notes,
        reference: row.reference,
      };
    }),
    total: count ?? 0,
  };
}

export async function createSalaryBulkPayment(input: {
  storeId: string;
  paymentDate: string;
  paymentMode: string;
  paidThroughAccountId?: string;
  notes?: string;
  reference?: string;
  lines: Array<{
    employeeId: string;
    totalPayment: number;
    paymentFromAdvance?: number;
    comment?: string;
  }>;
}): Promise<{ bulkId: string; bulkNumber: string }> {
  const profile = await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const storeId = await requireErpStoreId(input.storeId);

  const lines = input.lines
    .filter((l) => l.totalPayment > 0)
    .map((l) => ({
      employee_id: l.employeeId,
      total_payment: l.totalPayment,
      payment_from_advance: l.paymentFromAdvance ?? 0,
      comment: l.comment ?? "",
    }));

  if (lines.length === 0) {
    throw new Error("At least one payment line with a positive amount is required");
  }

  const { data, error } = await supabase.rpc("record_erp_salary_bulk_payment", {
    p_store_id: storeId,
    p_payment_date: input.paymentDate,
    p_payment_mode: input.paymentMode,
    p_lines: lines as Json,
    p_paid_through_account_id: input.paidThroughAccountId ?? null,
    p_reference: input.reference ?? null,
    p_notes: input.notes ?? null,
    p_created_by: profile.id,
  });

  if (error) throw new Error(error.message);

  const result = data as { bulk_id: string; bulk_number: string };
  await logAuditEvent({
    action: "create",
    entityType: "salary_bulk_payment",
    entityId: result.bulk_id,
    description: `Bulk salary payment ${result.bulk_number}`,
  });

  return { bulkId: result.bulk_id, bulkNumber: result.bulk_number };
}

export { listPaidThroughAccounts };
