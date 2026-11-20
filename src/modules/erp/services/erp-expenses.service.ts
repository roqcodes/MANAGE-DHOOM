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
import { nullIfEmptyDate } from "@/lib/format-date";
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
  dateFrom?: string;
  dateTo?: string;
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
    created_at: (row.created_at as string | null) ?? null,
    updated_at: (row.updated_at as string | null) ?? null,
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
      "id, expense_number, store_id, expense_date, amount, total_amount, reference, account_id, paid_through_account_id, vendor_id, user_id, created_at, updated_at, stores(name)",
      { count: "exact" },
    )
    .order("expense_date", { ascending: false })
    .order("updated_at", { ascending: false });

  if (activeStoreId) query = query.eq("store_id", activeStoreId);
  if (filters.accountId) query = query.eq("account_id", filters.accountId);
  const dateFrom = filters.dateFrom ?? periodRange.dateFrom;
  const dateTo = filters.dateTo ?? periodRange.dateTo;
  if (dateFrom) query = query.gte("expense_date", dateFrom);
  if (dateTo) query = query.lte("expense_date", dateTo);

  const search = filters.search?.trim();
  if (search) {
    query = query.or(`reference.ilike.%${search}%,notes.ilike.%${search}%,expense_number.ilike.%${search}%`);
  }

  const { data, error, count } = await query.range(from, from + limit - 1);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const [accountNames, vendorNames, customerNames] = await Promise.all([
    loadNameMap(
      supabase,
      "accounts",
      rows.flatMap((r) =>
        [r.account_id as string, r.paid_through_account_id as string | null].filter(Boolean) as string[],
      ),
    ),
    loadNameMap(
      supabase,
      "vendors",
      rows.map((r) => r.vendor_id as string | null).filter(Boolean) as string[],
    ),
    loadNameMap(
      supabase,
      "users",
      rows.map((r) => r.user_id as string | null).filter(Boolean) as string[],
    ),
  ]);

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
  if (input.attachmentUrl !== undefined) {
    const { error: patchError } = await supabase
      .from("erp_expenses")
      .update({ attachment_url: input.attachmentUrl } as never)
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
      expense_date: nullIfEmptyDate(input.expenseDate) ?? existing.expense_date,
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

/** 
 * Expense Report source — includes recorded expenses (erp_expenses) as well as
 * customer settlement discounts (Discount Allowed), payment bank charges,
 * commercial discounts (credit notes), and manual journal expenses across all expense accounts.
 */
export async function listExpenseReportRows(opts: {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
}): Promise<{
  details: Record<string, unknown>[];
  expense_accounts: Array<{ id: string; name: string; code: string; typeName: string }>;
}> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const storeId = await requireErpStoreId(opts.storeId);

  // 1. Fetch all active accounts and identify all Expense accounts
  const { data: accountsData, error: accErr } = await supabase
    .from("accounts")
    .select("id, name, code, store_id, account_types(name, account_category)")
    .eq("is_active", true)
    .order("name");

  if (accErr) throw new Error(accErr.message);

  const allExpenseAccounts: Array<{ id: string; name: string; code: string; typeName: string }> = [];
  const accountById = new Map<string, { id: string; code: string; name: string; typeName: string }>();

  for (const a of accountsData ?? []) {
    const type = a.account_types as { name?: string; account_category?: string } | null;
    const isExpense = type?.account_category === "Expense";
    const isCogs = type?.name === "Cost of Goods Sold" || a.code === "COST_OF_GOODS_SOLD";
    const typeName = type?.name ?? "Expense";
    const info = {
      id: a.id as string,
      code: (a.code as string | null) ?? "",
      name: (a.name as string | null) ?? "Uncategorized",
      typeName,
    };
    accountById.set(a.id, info);

    if (isExpense && !isCogs) {
      if (!a.store_id || a.store_id === storeId) {
        allExpenseAccounts.push(info);
      }
    }
  }

  const expenseAccountIds = new Set(allExpenseAccounts.map((a) => a.id));

  // Fallback default accounts
  const defaultDiscountAccount =
    allExpenseAccounts.find((a) => a.code === "DISCOUNT_ALLOWED") ??
    allExpenseAccounts.find((a) => a.name.toLowerCase().includes("discount")) ??
    allExpenseAccounts[0];
  const defaultDiscountAccountId = defaultDiscountAccount?.id;

  const defaultBankChargesAccount =
    allExpenseAccounts.find((a) => a.code === "BANK_CHARGES") ??
    allExpenseAccounts.find((a) => a.name.toLowerCase().includes("bank charge")) ??
    allExpenseAccounts[0];
  const defaultBankChargesAccountId = defaultBankChargesAccount?.id;

  // 2. Fetch direct expenses from erp_expenses
  const expensesPromise = supabase
    .from("erp_expenses")
    .select(
      "id, expense_number, expense_date, store_id, account_id, paid_through_account_id, vendor_id, user_id, billable_customer_id, created_by, reference, notes, tax_mode, tax_percent, tax_amount, total_amount, amount, is_billable, billed_invoice_id, attachment_url, stores(name)",
    )
    .eq("store_id", storeId)
    .gte("expense_date", opts.dateFrom)
    .lte("expense_date", opts.dateTo)
    .order("expense_date", { ascending: false })
    .order("expense_number", { ascending: false })
    .limit(5000);

  // 3. Fetch customer payments with settlement discount or bank charges
  const customerPaymentsPromise = supabase
    .from("erp_customer_payments")
    .select(
      "id, payment_number, payment_date, store_id, user_id, account_id, settlement_discount, settlement_discount_account_id, bank_charges, bank_charges_account_id, reference, notes, created_by, stores(name)",
    )
    .eq("store_id", storeId)
    .gte("payment_date", opts.dateFrom)
    .lte("payment_date", opts.dateTo)
    .or("settlement_discount.gt.0,bank_charges.gt.0")
    .order("payment_date", { ascending: false })
    .limit(3000);

  // 4. Fetch supplier payments with bank charges
  const supplierPaymentsPromise = supabase
    .from("erp_supplier_payments")
    .select(
      "id, payment_number, payment_date, store_id, vendor_id, account_id, bank_charges, bank_charges_account_id, reference, notes, created_by, stores(name)",
    )
    .eq("store_id", storeId)
    .gte("payment_date", opts.dateFrom)
    .lte("payment_date", opts.dateTo)
    .gt("bank_charges", 0)
    .order("payment_date", { ascending: false })
    .limit(3000);

  // 5. Fetch commercial discounts on credit notes
  const creditNotesPromise = supabase
    .from("erp_credit_notes")
    .select(
      "id, credit_note_number, credit_note_date, store_id, user_id, discount_account_id, total_amount, subtotal, tax_amount, notes, reference, created_by, stores(name)",
    )
    .eq("store_id", storeId)
    .eq("credit_kind", "discount")
    .neq("status", "void")
    .gte("credit_note_date", opts.dateFrom)
    .lte("credit_note_date", opts.dateTo)
    .gt("total_amount", 0)
    .limit(2000);

  // 6. Fetch manual journal entries debiting expense accounts
  const journalPromise = supabase
    .from("journal_entries")
    .select(
      "id, journal_number, transaction_date, store_id, description, source_entity_type, created_by, stores(name), journal_entry_lines(id, account_id, debit_amount, credit_amount, description)",
    )
    .eq("store_id", storeId)
    .eq("status", "posted")
    .gte("transaction_date", opts.dateFrom)
    .lte("transaction_date", opts.dateTo)
    .limit(3000);

  const [
    expensesRes,
    customerPaymentsRes,
    supplierPaymentsRes,
    creditNotesRes,
    journalRes,
  ] = await Promise.all([
    expensesPromise,
    customerPaymentsPromise,
    supplierPaymentsPromise,
    creditNotesPromise,
    journalPromise,
  ]);

  if (expensesRes.error) throw new Error(expensesRes.error.message);

  const rawExpenses = expensesRes.data ?? [];
  const rawCustomerPayments = customerPaymentsRes.data ?? [];
  const rawSupplierPayments = supplierPaymentsRes.data ?? [];
  const rawCreditNotes = creditNotesRes.data ?? [];
  const rawJournals = (journalRes.data ?? []).filter((je) => {
    const st = je.source_entity_type;
    return (
      !st ||
      (st !== "expense" &&
        st !== "customer_payment" &&
        st !== "supplier_payment" &&
        st !== "credit_note")
    );
  });

  const vendorIds = [
    ...new Set([
      ...rawExpenses.map((r) => r.vendor_id as string | null),
      ...rawSupplierPayments.map((r) => r.vendor_id as string | null),
    ].filter(Boolean) as string[]),
  ];

  const userIds = [
    ...new Set([
      ...rawExpenses.flatMap((r) => [
        r.user_id as string | null,
        r.billable_customer_id as string | null,
        r.created_by as string | null,
      ]),
      ...rawCustomerPayments.flatMap((r) => [
        r.user_id as string | null,
        r.created_by as string | null,
      ]),
      ...rawSupplierPayments.map((r) => r.created_by as string | null),
      ...rawCreditNotes.flatMap((r) => [
        r.user_id as string | null,
        r.created_by as string | null,
      ]),
      ...rawJournals.map((r) => r.created_by as string | null),
    ].filter(Boolean) as string[]),
  ];

  const [vendorNames, userNames] = await Promise.all([
    loadNameMap(supabase, "vendors", vendorIds),
    loadNameMap(supabase, "users", userIds),
  ]);

  const combinedRows: Record<string, unknown>[] = [];

  // Transform raw expenses
  for (const row of rawExpenses) {
    const accountId = row.account_id as string;
    const paidId = row.paid_through_account_id as string | null;
    const vendorId = (row.vendor_id as string | null) ?? null;
    const customerId =
      (row.billable_customer_id as string | null) ?? (row.user_id as string | null) ?? null;
    const createdBy = (row.created_by as string | null) ?? null;
    const acc = accountById.get(accountId);
    const paid = paidId ? accountById.get(paidId) : undefined;
    const taxMode = String(row.tax_mode ?? "none");
    const taxAmount = Number(row.tax_amount ?? 0);
    const totalAmount = Number(row.total_amount ?? 0);
    const amount = Number(row.amount ?? 0);
    const untaxed =
      taxMode === "inclusive" ? Math.round((totalAmount - taxAmount) * 100) / 100 : amount;
    const isBillable = Boolean(row.is_billable);
    const billedId = row.billed_invoice_id as string | null;
    const attachment = (row.attachment_url as string | null) ?? null;
    const store = row.stores as { name: string } | null;
    const billingStatus = billedId ? "Invoiced" : isBillable ? "Billable" : "Non-billable";
    const vendorName = vendorId ? vendorNames.get(vendorId) ?? "No vendor" : "No vendor";
    const customerName = customerId ? userNames.get(customerId) ?? "Unassigned" : "Unassigned";

    combinedRows.push({
      id: row.id,
      expense_number: row.expense_number,
      expense_date: row.expense_date,
      store_id: row.store_id,
      store_name: store?.name ?? null,
      account_id: accountId,
      account_code: acc?.code ?? "",
      account_name: acc?.name ?? "Uncategorized",
      account_type_name: acc?.typeName ?? "Expense",
      paid_through_account_id: paidId,
      paid_through_name: paid?.name ?? "Unassigned",
      vendor_id: vendorId,
      vendor_name: vendorName,
      customer_id: customerId,
      customer_name: customerName,
      party_name: vendorId ? vendorName : customerId ? customerName : "—",
      recorded_by: createdBy ? userNames.get(createdBy) ?? "—" : "—",
      reference: (row.reference as string | null) ?? null,
      notes: (row.notes as string | null) ?? null,
      tax_mode: taxMode,
      tax_percent: Number(row.tax_percent ?? 0),
      tax_amount: taxAmount,
      total_amount: totalAmount,
      untaxed_amount: untaxed,
      is_billable: isBillable,
      billed_invoice_id: billedId,
      billing_status: billingStatus,
      has_receipt: Boolean(attachment && attachment.trim().length > 0),
      link_url: `/admin/erp/expenses/${row.id}`,
    });
  }

  // Transform customer payments (Settlement discounts & Bank charges)
  for (const cp of rawCustomerPayments) {
    const store = cp.stores as { name: string } | null;
    const customerId = (cp.user_id as string | null) ?? null;
    const customerName = customerId ? userNames.get(customerId) ?? "Customer" : "Customer";
    const createdBy = (cp.created_by as string | null) ?? null;
    const recordedBy = createdBy ? userNames.get(createdBy) ?? "—" : "—";
    const depositAccountId = cp.account_id as string | null;
    const depositAcc = depositAccountId ? accountById.get(depositAccountId) : undefined;
    const settlementDiscount = Number(cp.settlement_discount ?? 0);
    const bankCharges = Number(cp.bank_charges ?? 0);

    if (settlementDiscount > 0) {
      const discountAccId =
        (cp.settlement_discount_account_id as string | null) ?? defaultDiscountAccountId ?? "";
      const discountAcc = discountAccId ? accountById.get(discountAccId) : undefined;
      combinedRows.push({
        id: `cp_${cp.id}_disc`,
        expense_number: `${cp.payment_number} (Discount)`,
        expense_date: cp.payment_date,
        store_id: cp.store_id,
        store_name: store?.name ?? null,
        account_id: discountAccId,
        account_code: discountAcc?.code ?? "DISCOUNT_ALLOWED",
        account_name: discountAcc?.name ?? "Discount Allowed",
        account_type_name: discountAcc?.typeName ?? "Expense",
        paid_through_account_id: depositAccountId,
        paid_through_name: depositAcc?.name ?? "Customer Settlement",
        vendor_id: null,
        vendor_name: "No vendor",
        customer_id: customerId,
        customer_name: customerName,
        party_name: customerName,
        recorded_by: recordedBy,
        reference: (cp.reference as string | null) ?? null,
        notes: (cp.notes as string | null) ?? "Customer settlement discount allowed",
        tax_mode: "none",
        tax_percent: 0,
        tax_amount: 0,
        total_amount: settlementDiscount,
        untaxed_amount: settlementDiscount,
        is_billable: false,
        billed_invoice_id: null,
        billing_status: "Settlement Discount",
        has_receipt: false,
        link_url: `/admin/erp/payments/${cp.id}`,
      });
    }

    if (bankCharges > 0) {
      const bcAccId =
        (cp.bank_charges_account_id as string | null) ?? defaultBankChargesAccountId ?? "";
      const bcAcc = bcAccId ? accountById.get(bcAccId) : undefined;
      combinedRows.push({
        id: `cp_${cp.id}_bc`,
        expense_number: `${cp.payment_number} (Bank Charges)`,
        expense_date: cp.payment_date,
        store_id: cp.store_id,
        store_name: store?.name ?? null,
        account_id: bcAccId,
        account_code: bcAcc?.code ?? "BANK_CHARGES",
        account_name: bcAcc?.name ?? "Bank Charges",
        account_type_name: bcAcc?.typeName ?? "Expense",
        paid_through_account_id: depositAccountId,
        paid_through_name: depositAcc?.name ?? "Bank",
        vendor_id: null,
        vendor_name: "No vendor",
        customer_id: customerId,
        customer_name: customerName,
        party_name: customerName,
        recorded_by: recordedBy,
        reference: (cp.reference as string | null) ?? null,
        notes: (cp.notes as string | null) ?? "Bank charges on payment receipt",
        tax_mode: "none",
        tax_percent: 0,
        tax_amount: 0,
        total_amount: bankCharges,
        untaxed_amount: bankCharges,
        is_billable: false,
        billed_invoice_id: null,
        billing_status: "Bank Charges",
        has_receipt: false,
        link_url: `/admin/erp/payments/${cp.id}`,
      });
    }
  }

  // Transform supplier payments (Bank charges)
  for (const sp of rawSupplierPayments) {
    const store = sp.stores as { name: string } | null;
    const vendorId = (sp.vendor_id as string | null) ?? null;
    const vendorName = vendorId ? vendorNames.get(vendorId) ?? "Vendor" : "Vendor";
    const createdBy = (sp.created_by as string | null) ?? null;
    const recordedBy = createdBy ? userNames.get(createdBy) ?? "—" : "—";
    const paidId = sp.account_id as string | null;
    const paidAcc = paidId ? accountById.get(paidId) : undefined;
    const bankCharges = Number(sp.bank_charges ?? 0);

    if (bankCharges > 0) {
      const bcAccId =
        (sp.bank_charges_account_id as string | null) ?? defaultBankChargesAccountId ?? "";
      const bcAcc = bcAccId ? accountById.get(bcAccId) : undefined;
      combinedRows.push({
        id: `sp_${sp.id}_bc`,
        expense_number: `${sp.payment_number} (Bank Charges)`,
        expense_date: sp.payment_date,
        store_id: sp.store_id,
        store_name: store?.name ?? null,
        account_id: bcAccId,
        account_code: bcAcc?.code ?? "BANK_CHARGES",
        account_name: bcAcc?.name ?? "Bank Charges",
        account_type_name: bcAcc?.typeName ?? "Expense",
        paid_through_account_id: paidId,
        paid_through_name: paidAcc?.name ?? "Bank",
        vendor_id: vendorId,
        vendor_name: vendorName,
        customer_id: null,
        customer_name: "Unassigned",
        party_name: vendorName,
        recorded_by: recordedBy,
        reference: (sp.reference as string | null) ?? null,
        notes: (sp.notes as string | null) ?? "Bank charges on supplier payment",
        tax_mode: "none",
        tax_percent: 0,
        tax_amount: 0,
        total_amount: bankCharges,
        untaxed_amount: bankCharges,
        is_billable: false,
        billed_invoice_id: null,
        billing_status: "Bank Charges",
        has_receipt: false,
        link_url: `/admin/erp/supplier-payments/${sp.id}`,
      });
    }
  }

  // Transform commercial discounts from credit notes
  for (const cn of rawCreditNotes) {
    const store = cn.stores as { name: string } | null;
    const customerId = (cn.user_id as string | null) ?? null;
    const customerName = customerId ? userNames.get(customerId) ?? "Customer" : "Customer";
    const createdBy = (cn.created_by as string | null) ?? null;
    const recordedBy = createdBy ? userNames.get(createdBy) ?? "—" : "—";
    const discAccId =
      (cn.discount_account_id as string | null) ?? defaultDiscountAccountId ?? "";
    const discAcc = discAccId ? accountById.get(discAccId) : undefined;
    const totalAmount = Number(cn.total_amount ?? 0);
    const subtotal = Number(cn.subtotal ?? totalAmount);
    const taxAmount = Number(cn.tax_amount ?? 0);

    combinedRows.push({
      id: `cn_${cn.id}_disc`,
      expense_number: cn.credit_note_number,
      expense_date: cn.credit_note_date,
      store_id: cn.store_id,
      store_name: store?.name ?? null,
      account_id: discAccId,
      account_code: discAcc?.code ?? "DISCOUNT_ALLOWED",
      account_name: discAcc?.name ?? "Discount Allowed",
      account_type_name: discAcc?.typeName ?? "Expense",
      paid_through_account_id: null,
      paid_through_name: "Credit Note Adjustment",
      vendor_id: null,
      vendor_name: "No vendor",
      customer_id: customerId,
      customer_name: customerName,
      party_name: customerName,
      recorded_by: recordedBy,
      reference: (cn.reference as string | null) ?? null,
      notes: (cn.notes as string | null) ?? "Commercial discount memo",
      tax_mode: taxAmount > 0 ? "exclusive" : "none",
      tax_percent: 0,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      untaxed_amount: subtotal,
      is_billable: false,
      billed_invoice_id: null,
      billing_status: "Commercial Discount",
      has_receipt: false,
      link_url: `/admin/erp/commercial-discounts`,
    });
  }

  // Transform manual journal entries with expense lines
  for (const je of rawJournals) {
    const store = je.stores as { name: string } | null;
    const createdBy = (je.created_by as string | null) ?? null;
    const recordedBy = createdBy ? userNames.get(createdBy) ?? "—" : "—";
    const lines = (je.journal_entry_lines as Array<{
      id: string;
      account_id: string;
      debit_amount: number;
      credit_amount: number;
      description: string | null;
    }>) ?? [];

    for (const line of lines) {
      if (!expenseAccountIds.has(line.account_id)) continue;
      const netDebit =
        Math.round((Number(line.debit_amount ?? 0) - Number(line.credit_amount ?? 0)) * 100) / 100;
      if (netDebit <= 0.001) continue;

      const acc = accountById.get(line.account_id);
      combinedRows.push({
        id: `je_${je.id}_${line.id}`,
        expense_number: je.journal_number,
        expense_date: je.transaction_date,
        store_id: je.store_id,
        store_name: store?.name ?? null,
        account_id: line.account_id,
        account_code: acc?.code ?? "",
        account_name: acc?.name ?? "Expense",
        account_type_name: acc?.typeName ?? "Expense",
        paid_through_account_id: null,
        paid_through_name: "Journal Entry",
        vendor_id: null,
        vendor_name: "No vendor",
        customer_id: null,
        customer_name: "Unassigned",
        party_name: "General Ledger",
        recorded_by: recordedBy,
        reference: (je.description as string | null) ?? null,
        notes: (line.description as string | null) ?? je.description ?? "Manual journal entry",
        tax_mode: "none",
        tax_percent: 0,
        tax_amount: 0,
        total_amount: netDebit,
        untaxed_amount: netDebit,
        is_billable: false,
        billed_invoice_id: null,
        billing_status: "Journal Entry",
        has_receipt: false,
        link_url: `/admin/erp/journal-entries/${je.id}`,
      });
    }
  }

  // Sort by expense_date desc, expense_number desc
  combinedRows.sort((a, b) => {
    const d = String(b.expense_date ?? "").localeCompare(String(a.expense_date ?? ""));
    if (d !== 0) return d;
    return String(b.expense_number ?? "").localeCompare(String(a.expense_number ?? ""));
  });

  return {
    details: combinedRows,
    expense_accounts: allExpenseAccounts,
  };
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
