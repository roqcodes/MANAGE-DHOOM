import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type {
  ErpEmployeeDetail,
  ErpEmployeeLedgerRow,
  ErpEmployeeListRow,
  ErpEmployeeOption,
} from "@/common/erp/hr-types";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import {
  requireErpStoreId,
  resolveErpStoreId,
} from "@/modules/erp/services/store-context.service";

type EmployeeListFilters = {
  page?: number;
  limit?: number;
  storeId?: string;
  search?: string;
  activeOnly?: boolean;
};

function mapEmployeeRow(row: Record<string, unknown>): ErpEmployeeListRow {
  const store = row.stores as { name: string } | null;
  return {
    id: row.id as string,
    employee_number: row.employee_number as string,
    employee_code: (row.employee_code as string | null) ?? null,
    store_id: row.store_id as string,
    full_name: row.full_name as string,
    mobile: row.mobile as string,
    id_number: (row.id_number as string | null) ?? null,
    id_expiry_date: (row.id_expiry_date as string | null) ?? null,
    joining_date: row.joining_date as string,
    is_active: row.is_active as boolean,
    discontinuation_date: (row.discontinuation_date as string | null) ?? null,
    basic_salary: Number(row.basic_salary ?? 0),
    allowance: Number(row.allowance ?? 0),
    net_salary: Number(row.net_salary ?? 0),
    salary_balance: Number(row.salary_balance ?? 0),
    advance_balance: Number(row.advance_balance ?? 0),
    store_name: store?.name ?? null,
  };
}

export async function listEmployees(
  filters: EmployeeListFilters = {},
): Promise<{ data: ErpEmployeeListRow[]; total: number }> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const page = filters.page ?? 0;
  const limit = filters.limit ?? 20;
  const from = page * limit;
  const storeId = await resolveErpStoreId(filters.storeId);

  let query = supabase
    .from("erp_employees")
    .select("*, stores(name)", { count: "exact" })
    .order("full_name", { ascending: true })
    .range(from, from + limit - 1);

  if (storeId) query = query.eq("store_id", storeId);
  if (filters.activeOnly) query = query.eq("is_active", true);
  if (filters.search?.trim()) {
    const s = filters.search.trim();
    query = query.or(
      `full_name.ilike.%${s}%,mobile.ilike.%${s}%,employee_code.ilike.%${s}%,employee_number.ilike.%${s}%`,
    );
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  return {
    data: (data ?? []).map((row) => mapEmployeeRow(row as Record<string, unknown>)),
    total: count ?? 0,
  };
}

export async function listEmployeeOptions(storeId?: string): Promise<ErpEmployeeOption[]> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const activeStoreId = await resolveErpStoreId(storeId);

  let query = supabase
    .from("erp_employees")
    .select("id, full_name, employee_number, salary_balance, advance_balance, net_salary, store_id")
    .eq("is_active", true)
    .order("full_name");

  if (activeStoreId) query = query.eq("store_id", activeStoreId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    full_name: row.full_name,
    employee_number: row.employee_number,
    salary_balance: Number(row.salary_balance ?? 0),
    advance_balance: Number(row.advance_balance ?? 0),
    net_salary: Number(row.net_salary ?? 0),
    store_id: row.store_id,
  }));
}

export async function getEmployeeDetail(id: string): Promise<ErpEmployeeDetail> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("erp_employees")
    .select("*, stores(name)")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Employee not found");

  const { data: ledgerRows, error: ledgerErr } = await supabase
    .from("erp_employee_ledger")
    .select("id, entry_date, entry_type, description, salary_credit, payment_debit, balance_after")
    .eq("employee_id", id)
    .order("entry_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (ledgerErr) throw new Error(ledgerErr.message);

  const base = mapEmployeeRow(data as Record<string, unknown>);
  const ledger: ErpEmployeeLedgerRow[] = (ledgerRows ?? []).map((row) => ({
    id: row.id,
    entry_date: row.entry_date,
    entry_type: row.entry_type,
    description: row.description,
    salary_credit: Number(row.salary_credit ?? 0),
    payment_debit: Number(row.payment_debit ?? 0),
    balance_after: Number(row.balance_after ?? 0),
  }));

  return {
    ...base,
    date_of_birth: (data.date_of_birth as string | null) ?? null,
    notes: (data.notes as string | null) ?? null,
    created_at: data.created_at,
    ledger,
  };
}

export async function createEmployee(input: {
  storeId: string;
  fullName: string;
  mobile: string;
  joiningDate: string;
  basicSalary?: number;
  allowance?: number;
  employeeCode?: string;
  idNumber?: string;
  idExpiryDate?: string;
  dateOfBirth?: string;
  isActive?: boolean;
  notes?: string;
}): Promise<string> {
  const profile = await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const storeId = await requireErpStoreId(input.storeId);

  const { data, error } = await supabase.rpc("create_erp_employee", {
    p_store_id: storeId,
    p_full_name: input.fullName,
    p_mobile: input.mobile,
    p_joining_date: input.joiningDate,
    p_basic_salary: input.basicSalary ?? 0,
    p_allowance: input.allowance ?? 0,
    p_employee_code: input.employeeCode ?? null,
    p_id_number: input.idNumber ?? null,
    p_id_expiry_date: input.idExpiryDate ?? null,
    p_date_of_birth: input.dateOfBirth ?? null,
    p_is_active: input.isActive ?? true,
    p_notes: input.notes ?? null,
    p_created_by: profile.id,
  });

  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "create",
    entityType: "employee",
    entityId: data as string,
    description: `Created employee ${input.fullName}`,
  });

  return data as string;
}

export async function updateEmployee(
  id: string,
  input: {
    storeId?: string;
    fullName?: string;
    mobile?: string;
    joiningDate?: string;
    basicSalary?: number;
    allowance?: number;
    employeeCode?: string;
    idNumber?: string;
    idExpiryDate?: string;
    dateOfBirth?: string;
    isActive?: boolean;
    discontinuationDate?: string;
    notes?: string;
  },
): Promise<void> {
  const profile = await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("update_erp_employee", {
    p_employee_id: id,
    p_store_id: input.storeId ?? null,
    p_full_name: input.fullName ?? null,
    p_mobile: input.mobile ?? null,
    p_joining_date: input.joiningDate ?? null,
    p_basic_salary: input.basicSalary ?? null,
    p_allowance: input.allowance ?? null,
    p_employee_code: input.employeeCode ?? null,
    p_id_number: input.idNumber ?? null,
    p_id_expiry_date: input.idExpiryDate ?? null,
    p_date_of_birth: input.dateOfBirth ?? null,
    p_is_active: input.isActive ?? null,
    p_discontinuation_date: input.discontinuationDate ?? null,
    p_notes: input.notes ?? null,
    p_actor: profile.id,
  });

  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "update",
    entityType: "employee",
    entityId: id,
    description: "Updated employee",
  });
}

export async function deleteEmployee(id: string): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { count, error: payErr } = await supabase
    .from("erp_salary_payments")
    .select("id", { count: "exact", head: true })
    .eq("employee_id", id);

  if (payErr) throw new Error(payErr.message);
  if ((count ?? 0) > 0) {
    throw new Error("Cannot delete employee with salary payment history");
  }

  const { error } = await supabase.from("erp_employees").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "delete",
    entityType: "employee",
    entityId: id,
    description: "Deleted employee",
  });
}
