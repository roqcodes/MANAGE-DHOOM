import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type {
  ErpExpenseDetail,
  ErpExpenseListRow,
  PaidThroughAccountOption,
} from "@/common/erp/purchasing-types";
import type { JournalEntryLineRow } from "@/common/erp/finance-types";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import { getJournalEntryDetail } from "@/modules/erp/services/erp-journal.service";
import {
  requireErpStoreId,
  resolveErpStoreId,
  withAccountStoreScope,
} from "@/modules/erp/services/store-context.service";

type ExpenseListFilters = {
  page?: number;
  limit?: number;
  storeId?: string;
  period?: string;
  accountId?: string;
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
  if (period === "today") {
    const today = now.toISOString().slice(0, 10);
    return { dateFrom: today, dateTo: today };
  }
  return {};
}

function calcTaxFields(amount: number, taxMode: string, taxPercent: number) {
  if (taxMode === "exclusive") {
    const taxAmount = Math.round(amount * taxPercent) / 100;
    return { taxAmount, total: amount + taxAmount };
  }
  if (taxMode === "inclusive") {
    const total = amount;
    const taxAmount =
      taxPercent > 0
        ? Math.round((total * taxPercent) / (100 + taxPercent) * 100) / 100
        : 0;
    return { taxAmount, total };
  }
  return { taxAmount: 0, total: amount };
}

async function loadNameMap(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  table: "accounts" | "vendors" | "users",
  ids: string[],
): Promise<Map<string, string | null>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, string | null>();
  if (unique.length === 0) return map;

  const { data, error } = await supabase.from(table).select("id, name").in("id", unique);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    map.set(row.id, row.name);
  }
  return map;
}

function mapExpenseRow(
  row: Record<string, unknown>,
  accountNames: Map<string, string | null>,
  paidNames: Map<string, string | null>,
  vendorNames: Map<string, string | null>,
  customerNames: Map<string, string | null>,
): ErpExpenseListRow {
  const store = row.stores as { name: string } | null;
  const accountId = row.account_id as string;
  const paidId = row.paid_through_account_id as string | null;
  const vendorId = row.vendor_id as string | null;
  const userId = row.user_id as string | null;

  return {
    id: row.id as string,
    expense_number: row.expense_number as string,
    store_id: row.store_id as string,
    expense_date: row.expense_date as string,
    amount: Number(row.amount ?? 0),
    total_amount: Number(row.total_amount ?? 0),
    reference: (row.reference as string | null) ?? null,
    account_id: accountId,
    account_name: accountNames.get(accountId) ?? null,
    paid_through_name: paidId ? paidNames.get(paidId) ?? null : null,
    vendor_name: vendorId ? vendorNames.get(vendorId) ?? null : null,
    customer_name: userId ? customerNames.get(userId) ?? null : null,
    store_name: store?.name ?? null,
  };
}

export async function listExpenseAccounts(
  storeId?: string,
): Promise<Array<{ id: string; name: string; code: string }>> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const activeStoreId = await resolveErpStoreId(storeId);

  const { data, error } = await withAccountStoreScope(
    supabase
      .from("accounts")
      .select("id, name, code, account_types(account_category)")
      .eq("is_active", true)
      .order("name"),
    activeStoreId,
  );

  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter((row) => {
      const type = row.account_types as { account_category: string } | null;
      return type?.account_category === "Expense";
    })
    .map((row) => ({ id: row.id, name: row.name, code: row.code }));
}

export async function listExpensePaidThroughAccounts(
  storeId?: string,
): Promise<PaidThroughAccountOption[]> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const activeStoreId = await resolveErpStoreId(storeId);

  const { data, error } = await withAccountStoreScope(
    supabase
      .from("accounts")
      .select("id, code, name, store_id, account_types(name), stores(name)")
      .eq("is_active", true)
      .order("name"),
    activeStoreId,
  );

  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter((row) => {
      const type = row.account_types as { name: string } | null;
      const typeName = type?.name ?? "";
      return /cash|bank|petty/i.test(typeName);
    })
    .map((row) => {
      const type = row.account_types as { name: string } | null;
      const store = row.stores as { name: string } | null;
      return {
        id: row.id,
        code: row.code,
        name: row.name,
        account_type_name: type?.name ?? "—",
        store_name: store?.name ?? null,
      };
    });
}

export async function listExpenses(
  filters: ExpenseListFilters = {},
): Promise<{ data: ErpExpenseListRow[]; total: number; totalAmount: number }> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const page = filters.page ?? 0;
  const limit = filters.limit ?? 20;
  const from = page * limit;
  const periodRange = periodToDateRange(filters.period);
  const activeStoreId = await resolveErpStoreId(filters.storeId);

  let query = supabase
    .from("erp_expenses")
    .select(
      "id, expense_number, store_id, expense_date, amount, total_amount, reference, account_id, paid_through_account_id, vendor_id, user_id, stores(name)",
      { count: "exact" },
    )
    .order("expense_date", { ascending: false });

  if (activeStoreId) query = query.eq("store_id", activeStoreId);
  if (filters.accountId) query = query.eq("account_id", filters.accountId);
  const dateFrom = periodRange.dateFrom;
  const dateTo = periodRange.dateTo;
  if (dateFrom) query = query.gte("expense_date", dateFrom);
  if (dateTo) query = query.lte("expense_date", dateTo);

  const search = filters.search?.trim();
  if (search) {
    query = query.or(`reference.ilike.%${search}%,notes.ilike.%${search}%,expense_number.ilike.%${search}%`);
  }

  const { data, error, count } = await query.range(from, from + limit - 1);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const accountNames = await loadNameMap(
    supabase,
    "accounts",
    rows.flatMap((r) => [r.account_id as string, r.paid_through_account_id as string | null].filter(Boolean) as string[]),
  );
  const vendorNames = await loadNameMap(
    supabase,
    "vendors",
    rows.map((r) => r.vendor_id as string | null).filter(Boolean) as string[],
  );
  const customerNames = await loadNameMap(
    supabase,
    "users",
    rows.map((r) => r.user_id as string | null).filter(Boolean) as string[],
  );

  const mapped = rows.map((row) =>
    mapExpenseRow(
      row as Record<string, unknown>,
      accountNames,
      accountNames,
      vendorNames,
      customerNames,
    ),
  );

  const totalAmount = mapped.reduce((sum, row) => sum + row.total_amount, 0);

  return { data: mapped, total: count ?? 0, totalAmount };
}

export async function createExpense(input: {
  storeId?: string;
  expenseDate: string;
  accountId: string;
  amount: number;
  taxMode?: string;
  taxPercent?: number;
  paidThroughAccountId?: string | null;
  vendorId?: string | null;
  userId?: string | null;
  reference?: string;
  notes?: string;
  isBillable?: boolean;
  billableCustomerId?: string | null;
  attachmentUrl?: string | null;
}): Promise<string> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const storeId = await requireErpStoreId(input.storeId);
  if (!input.paidThroughAccountId) throw new Error("Paid through account is required");

  const { data, error } = await supabase.rpc("create_erp_expense", {
    p_store_id: storeId,
    p_expense_date: input.expenseDate,
    p_account_id: input.accountId,
    p_amount: input.amount,
    p_tax_mode: input.taxMode ?? "exclusive",
    p_tax_percent: input.taxPercent ?? 0,
    p_paid_through_account_id: input.paidThroughAccountId,
    p_vendor_id: input.vendorId ?? undefined,
    p_user_id: input.userId ?? undefined,
    p_reference: input.reference ?? undefined,
    p_notes: input.notes ?? undefined,
  });

  if (error) throw new Error(error.message);

  const expenseId = data as string;
  if (
    input.isBillable !== undefined ||
    input.billableCustomerId !== undefined ||
    input.attachmentUrl !== undefined
  ) {
    const { error: patchError } = await supabase
      .from("erp_expenses")
      .update({
        ...(input.isBillable !== undefined ? { is_billable: input.isBillable } : {}),
        ...(input.billableCustomerId !== undefined
          ? { billable_customer_id: input.billableCustomerId }
          : {}),
        ...(input.attachmentUrl !== undefined ? { attachment_url: input.attachmentUrl } : {}),
      } as never)
      .eq("id", expenseId);
    if (patchError) throw new Error(patchError.message);
  }

  await logAuditEvent({
    action: "create_expense",
    entityType: "expense",
    entityId: expenseId,
    description: `Expense: ${input.amount}`,
    storeId,
  });

  return expenseId;
}

export async function getExpenseDetail(expenseId: string): Promise<ErpExpenseDetail> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("erp_expenses")
    .select("*")
    .eq("id", expenseId)
    .single();

  if (error) throw new Error(error.message);

  const [accountNames, paidNames, vendorNames, customerNames, storeRes] = await Promise.all([
    loadNameMap(supabase, "accounts", [data.account_id]),
    data.paid_through_account_id
      ? loadNameMap(supabase, "accounts", [data.paid_through_account_id])
      : Promise.resolve(new Map()),
    data.vendor_id
      ? loadNameMap(supabase, "vendors", [data.vendor_id])
      : Promise.resolve(new Map()),
    data.user_id
      ? loadNameMap(supabase, "users", [data.user_id])
      : Promise.resolve(new Map()),
    supabase.from("stores").select("name").eq("id", data.store_id).maybeSingle(),
  ]);

  return {
    id: data.id,
    expense_number: data.expense_number,
    store_id: data.store_id,
    store_name: storeRes.data?.name ?? null,
    expense_date: data.expense_date,
    account_id: data.account_id,
    account_name: accountNames.get(data.account_id) ?? null,
    amount: Number(data.amount ?? 0),
    tax_mode: data.tax_mode,
    tax_percent: Number(data.tax_percent ?? 0),
    tax_amount: Number(data.tax_amount ?? 0),
    total_amount: Number(data.total_amount ?? 0),
    paid_through_account_id: data.paid_through_account_id,
    paid_through_name: data.paid_through_account_id
      ? paidNames.get(data.paid_through_account_id) ?? null
      : null,
    vendor_id: data.vendor_id,
    vendor_name: data.vendor_id ? vendorNames.get(data.vendor_id) ?? null : null,
    user_id: data.user_id,
    customer_name: data.user_id ? customerNames.get(data.user_id) ?? null : null,
    reference: data.reference,
    notes: data.notes,
    is_billable: Boolean(data.is_billable),
    billable_customer_id: data.billable_customer_id,
    billed_invoice_id: data.billed_invoice_id,
    attachment_url: data.attachment_url,
    created_at: data.created_at,
  };
}

export async function getExpenseJournalLines(
  expenseId: string,
): Promise<JournalEntryLineRow[]> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data: journal } = await supabase
    .from("journal_entries")
    .select("id")
    .eq("source_entity_type", "expense")
    .eq("source_entity_id", expenseId)
    .eq("status", "posted")
    .maybeSingle();

  if (!journal) return [];

  const detail = await getJournalEntryDetail(journal.id);
  return detail.lines;
}

export async function updateExpense(
  expenseId: string,
  input: {
    storeId?: string;
    expenseDate?: string;
    accountId?: string;
    amount?: number;
    taxMode?: string;
    taxPercent?: number;
    paidThroughAccountId?: string | null;
    vendorId?: string | null;
    userId?: string | null;
    reference?: string;
    notes?: string;
    isBillable?: boolean;
    billableCustomerId?: string | null;
    attachmentUrl?: string | null;
  },
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const existing = await getExpenseDetail(expenseId);
  const amount = input.amount ?? existing.amount;
  const taxMode = input.taxMode ?? existing.tax_mode;
  const taxPercent = input.taxPercent ?? existing.tax_percent;
  const { taxAmount, total } = calcTaxFields(amount, taxMode, taxPercent);

  const { error } = await supabase
    .from("erp_expenses")
    .update({
      store_id: input.storeId ?? existing.store_id,
      expense_date: input.expenseDate ?? existing.expense_date,
      account_id: input.accountId ?? existing.account_id,
      amount,
      tax_mode: taxMode,
      tax_percent: taxPercent,
      tax_amount: taxAmount,
      total_amount: total,
      paid_through_account_id:
        input.paidThroughAccountId !== undefined
          ? input.paidThroughAccountId
          : existing.paid_through_account_id,
      vendor_id: input.vendorId !== undefined ? input.vendorId : existing.vendor_id,
      user_id: input.userId !== undefined ? input.userId : existing.user_id,
      reference: input.reference !== undefined ? input.reference : existing.reference,
      notes: input.notes !== undefined ? input.notes : existing.notes,
      ...(input.isBillable !== undefined ? { is_billable: input.isBillable } : {}),
      ...(input.billableCustomerId !== undefined
        ? { billable_customer_id: input.billableCustomerId }
        : {}),
      ...(input.attachmentUrl !== undefined ? { attachment_url: input.attachmentUrl } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", expenseId);

  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "update",
    entityType: "expense",
    entityId: expenseId,
    description: "Expense updated",
    storeId: input.storeId ?? existing.store_id,
  });
}

export async function deleteExpense(expenseId: string): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data: existing } = await supabase
    .from("erp_expenses")
    .select("store_id, expense_number")
    .eq("id", expenseId)
    .single();

  const { error } = await supabase.from("erp_expenses").delete().eq("id", expenseId);
  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "delete",
    entityType: "expense",
    entityId: expenseId,
    description: `Expense deleted: ${existing?.expense_number ?? expenseId}`,
    storeId: existing?.store_id,
  });
}
