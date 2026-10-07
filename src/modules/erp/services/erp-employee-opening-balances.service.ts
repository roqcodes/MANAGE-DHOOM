import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type {
  ErpEmployeeOpeningBalanceLineInput,
  ErpEmployeeOpeningBalanceListRow,
} from "@/common/erp/hr-types";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import {
  requireErpStoreId,
  resolveErpStoreId,
} from "@/modules/erp/services/store-context.service";
import type { Json } from "@/lib/integrations/supabase/types";

type OpeningBalanceListFilters = {
  page?: number;
  limit?: number;
  storeId?: string;
  search?: string;
};

export async function listEmployeeOpeningBalances(
  filters: OpeningBalanceListFilters = {},
): Promise<{ data: ErpEmployeeOpeningBalanceListRow[]; total: number }> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const page = filters.page ?? 0;
  const limit = filters.limit ?? 20;
  const from = page * limit;
  const storeId = await resolveErpStoreId(filters.storeId);

  let query = supabase
    .from("erp_employee_opening_balance_batches")
    .select("id, batch_number, store_id, entry_date, notes, total_amount, stores(name)", {
      count: "exact",
    })
    .order("entry_date", { ascending: false })
    .range(from, from + limit - 1);

  if (storeId) query = query.eq("store_id", storeId);
  if (filters.search?.trim()) {
    query = query.ilike("batch_number", `%${filters.search.trim()}%`);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  return {
    data: (data ?? []).map((row) => {
      const store = row.stores as { name: string } | null;
      return {
        id: row.id,
        batch_number: row.batch_number,
        store_id: row.store_id,
        store_name: store?.name ?? null,
        entry_date: row.entry_date,
        notes: row.notes,
        total_amount: Number(row.total_amount ?? 0),
      };
    }),
    total: count ?? 0,
  };
}

export async function createEmployeeOpeningBalances(input: {
  storeId: string;
  entryDate: string;
  notes?: string;
  lines: ErpEmployeeOpeningBalanceLineInput[];
}): Promise<string> {
  const profile = await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const storeId = await requireErpStoreId(input.storeId);

  const lines = input.lines
    .filter((l) => l.opening_balance > 0)
    .map((l) => ({
      employee_id: l.employee_id,
      opening_balance: l.opening_balance,
      joining_date: l.joining_date ?? null,
    }));

  if (lines.length === 0) {
    throw new Error("At least one employee with a positive opening balance is required");
  }

  const { data, error } = await supabase.rpc("record_erp_employee_opening_balances", {
    p_store_id: storeId,
    p_entry_date: input.entryDate,
    p_lines: lines as Json,
    p_notes: input.notes ?? null,
    p_created_by: profile.id,
  });

  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "create",
    entityType: "employee_opening_balance",
    entityId: data as string,
    description: "Recorded employee opening balances",
  });

  return data as string;
}
