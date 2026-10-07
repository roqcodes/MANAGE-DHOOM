import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type { ErpPaySlipListRow } from "@/common/erp/hr-types";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import {
  requireErpStoreId,
  resolveErpStoreId,
} from "@/modules/erp/services/store-context.service";

type PaySlipListFilters = {
  page?: number;
  limit?: number;
  storeId?: string;
  employeeId?: string;
  period?: string;
  search?: string;
};

function periodToMonthYear(period?: string): { month?: number; year?: number } {
  if (!period || period === "all") return {};
  const now = new Date();
  if (period === "this_month") {
    return { month: now.getMonth() + 1, year: now.getFullYear() };
  }
  if (period === "previous_month") {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { month: d.getMonth() + 1, year: d.getFullYear() };
  }
  if (period === "this_quarter") {
    return { year: now.getFullYear() };
  }
  return {};
}

export async function listPaySlips(
  filters: PaySlipListFilters = {},
): Promise<{ data: ErpPaySlipListRow[]; total: number }> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const page = filters.page ?? 0;
  const limit = filters.limit ?? 20;
  const from = page * limit;
  const storeId = await resolveErpStoreId(filters.storeId);
  const { month, year } = periodToMonthYear(filters.period);

  let query = supabase
    .from("erp_pay_slips")
    .select(
      "id, payslip_number, employee_id, store_id, period_month, period_year, period_label, from_date, to_date, days_count, basic_salary, allowance, net_salary, erp_employees(full_name), stores(name)",
      { count: "exact" },
    )
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false })
    .range(from, from + limit - 1);

  if (storeId) query = query.eq("store_id", storeId);
  if (filters.employeeId) query = query.eq("employee_id", filters.employeeId);
  if (month) query = query.eq("period_month", month);
  if (year) query = query.eq("period_year", year);

  if (filters.search?.trim()) {
    const s = filters.search.trim();
    const { data: empMatches } = await supabase
      .from("erp_employees")
      .select("id")
      .ilike("full_name", `%${s}%`)
      .limit(50);
    const empIds = (empMatches ?? []).map((e) => e.id);
    if (empIds.length > 0) {
      query = query.in("employee_id", empIds);
    } else {
      query = query.ilike("payslip_number", `%${s}%`);
    }
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  return {
    data: (data ?? []).map((row) => {
      const employee = row.erp_employees as { full_name: string } | null;
      const store = row.stores as { name: string } | null;
      return {
        id: row.id,
        payslip_number: row.payslip_number,
        employee_id: row.employee_id,
        employee_name: employee?.full_name ?? null,
        store_id: row.store_id,
        store_name: store?.name ?? null,
        period_month: row.period_month,
        period_year: row.period_year,
        period_label: row.period_label,
        from_date: row.from_date,
        to_date: row.to_date,
        days_count: row.days_count,
        basic_salary: Number(row.basic_salary ?? 0),
        allowance: Number(row.allowance ?? 0),
        net_salary: Number(row.net_salary ?? 0),
      };
    }),
    total: count ?? 0,
  };
}

export async function generatePaySlips(input: {
  storeId: string;
  periodMonth: number;
  periodYear: number;
  fromDate?: string;
  toDate?: string;
  employeeId?: string;
}): Promise<{ createdCount: number }> {
  const profile = await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const storeId = await requireErpStoreId(input.storeId);

  const { data, error } = await supabase.rpc("generate_erp_pay_slips", {
    p_store_id: storeId,
    p_period_month: input.periodMonth,
    p_period_year: input.periodYear,
    p_from_date: input.fromDate ?? null,
    p_to_date: input.toDate ?? null,
    p_employee_id: input.employeeId ?? null,
    p_created_by: profile.id,
  });

  if (error) throw new Error(error.message);

  const result = data as { created_count: number };
  await logAuditEvent({
    action: "create",
    entityType: "pay_slip",
    entityId: storeId,
    description: `Generated ${result.created_count} pay slips`,
  });

  return { createdCount: result.created_count ?? 0 };
}
