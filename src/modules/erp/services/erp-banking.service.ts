import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { invokeRpc } from "@/lib/integrations/supabase/rpc";
import type {
  AccountStoreBalanceRow,
  AccountTransactionRow,
  BankingAccountRow,
  PaymentStatementRow,
  ProfitWithdrawalRow,
} from "@/common/erp/finance-types";
import { createAccount } from "@/modules/erp/services/erp-accounts.service";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import {
  requireErpStoreId,
  resolveErpStoreId,
  withAccountStoreScope,
} from "@/modules/erp/services/store-context.service";

const CASH_ACCOUNT_TYPES = new Set(["Cash", "Bank"]);
const LOAN_TYPE_PATTERN = /loan/i;

function isCashAccountRow(typeName: string, category: string) {
  if (CASH_ACCOUNT_TYPES.has(typeName)) return true;
  if (category === "Liability" && LOAN_TYPE_PATTERN.test(typeName)) return true;
  if (category === "Liability" && typeName === "Other Current Liability") return true;
  return LOAN_TYPE_PATTERN.test(typeName);
}

function mapAccountRow(
  row: Record<string, unknown>,
  balance: number,
): BankingAccountRow {
  const type = row.account_types as { name: string; account_category: string } | null;
  const store = row.stores as { name: string } | null;
  return {
    id: row.id as string,
    code: row.code as string,
    name: row.name as string,
    description: row.description as string,
    account_type_id: row.account_type_id as string,
    account_type_name: type?.name ?? "—",
    account_category: type?.account_category ?? "—",
    store_id: row.store_id as string | null,
    store_name: store?.name ?? null,
    is_system: row.is_system as boolean,
    is_locked: row.is_locked as boolean,
    is_active: row.is_active as boolean,
    opening_balance: Number(row.opening_balance ?? 0),
    current_balance: balance,
  };
}

export async function listBankingAccounts(storeId?: string): Promise<BankingAccountRow[]> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const activeStoreId = await resolveErpStoreId(storeId);
  const { data, error } = await withAccountStoreScope(
    supabase
      .from("accounts")
      .select(
        "id, code, name, description, account_type_id, store_id, is_system, is_locked, is_active, opening_balance, account_types(name, account_category), stores(name)",
      )
      .eq("is_active", true)
      .order("name"),
    activeStoreId,
  );
  if (error) throw new Error(error.message);

  const cashRows = (data ?? []).filter((row) => {
    const type = row.account_types as { name: string; account_category: string } | null;
    return isCashAccountRow(type?.name ?? "", type?.account_category ?? "");
  });

  const ids = cashRows.map((row) => row.id as string);
  const balanceByAccount = new Map<string, number>();
  if (ids.length > 0) {
    const { data: balRows, error: balErr } = await invokeRpc(
      supabase,
      "get_account_balances",
      { p_account_ids: ids },
    );
    if (balErr) {
      for (const id of ids) {
        const { data: balance } = await supabase.rpc("get_account_balance", {
          p_account_id: id,
        });
        balanceByAccount.set(id, Number(balance ?? 0));
      }
    } else {
      for (const row of (balRows ?? []) as { account_id: string; balance: number }[]) {
        balanceByAccount.set(row.account_id, Number(row.balance ?? 0));
      }
    }
  }

  return cashRows.map((row) =>
    mapAccountRow(row, balanceByAccount.get(row.id as string) ?? 0),
  );
}

export async function getBankingAccount(accountId: string): Promise<BankingAccountRow | null> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("accounts")
    .select(
      "id, code, name, description, account_type_id, store_id, is_system, is_locked, is_active, opening_balance, account_types(name, account_category), stores(name)",
    )
    .eq("id", accountId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const { data: balance } = await supabase.rpc("get_account_balance", {
    p_account_id: data.id,
  });
  return mapAccountRow(data, Number(balance ?? 0));
}

export async function createBankingAccount(input: {
  accountKind: "cash" | "loan";
  name: string;
  code: string;
  description?: string;
  storeId?: string;
  openingBalance?: number;
}): Promise<string> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const typeName = input.accountKind === "loan" ? "Other Current Liability" : "Cash";
  const { data: typeRow, error: typeErr } = await supabase
    .from("account_types")
    .select("id")
    .ilike("name", typeName)
    .limit(1)
    .maybeSingle();
  if (typeErr) throw new Error(typeErr.message);
  if (!typeRow?.id) throw new Error(`Account type "${typeName}" not found`);

  return createAccount({
    accountTypeId: typeRow.id,
    name: input.name,
    code: input.code,
    description: input.description,
    storeId: (await resolveErpStoreId(input.storeId)) ?? undefined,
    openingBalance: input.openingBalance ?? 0,
  });
}

export async function listAccountTransactions(
  accountId: string,
  options?: { storeId?: string; limit?: number },
): Promise<AccountTransactionRow[]> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const activeStoreId = await resolveErpStoreId(options?.storeId);

  let query = supabase
    .from("erp_account_transactions")
    .select(
      "id, transaction_number, transaction_date, transaction_type, details, debit_amount, credit_amount, running_balance, reference, payment_type, store_id, account_id",
    )
    .eq("account_id", accountId)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? 100);

  if (activeStoreId) query = query.eq("store_id", activeStoreId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
      id: row.id,
      transaction_number: row.transaction_number,
      transaction_date: row.transaction_date,
      transaction_type: row.transaction_type,
      details: row.details,
      debit_amount: Number(row.debit_amount),
      credit_amount: Number(row.credit_amount),
      running_balance: row.running_balance != null ? Number(row.running_balance) : null,
      reference: row.reference,
      payment_type: row.payment_type,
      store_id: row.store_id,
      store_name: null,
      account_id: row.account_id,
      account_name: null,
    }));
}

export async function getAccountStoreBalances(
  accountId: string,
): Promise<AccountStoreBalanceRow[]> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("erp_account_transactions")
    .select("store_id, debit_amount, credit_amount")
    .eq("account_id", accountId);
  if (error) throw new Error(error.message);

  const storeIds = [
    ...new Set((data ?? []).map((r) => r.store_id).filter(Boolean)),
  ] as string[];
  const storeNameById = new Map<string, string>();
  if (storeIds.length > 0) {
    const { data: stores } = await supabase
      .from("stores")
      .select("id, name")
      .in("id", storeIds);
    for (const s of stores ?? []) {
      storeNameById.set(s.id, s.name);
    }
  }

  const map = new Map<string, AccountStoreBalanceRow>();
  for (const row of data ?? []) {
    const key = row.store_id ?? "unassigned";
    const existing = map.get(key) ?? {
      store_id: row.store_id,
      store_name: row.store_id
        ? (storeNameById.get(row.store_id) ?? "Store")
        : "Unassigned",
      balance: 0,
    };
    existing.balance += Number(row.debit_amount ?? 0) - Number(row.credit_amount ?? 0);
    map.set(key, existing);
  }

  const account = await getBankingAccount(accountId);
  if (account && map.size === 0) {
    return [
      {
        store_id: account.store_id,
        store_name: account.store_name ?? "All stores",
        balance: account.current_balance,
      },
    ];
  }

  return Array.from(map.values()).sort((a, b) => b.balance - a.balance);
}

export async function listPaymentStatements(filters?: {
  storeId?: string;
  accountId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  limit?: number;
}): Promise<{ rows: PaymentStatementRow[]; openingBalance: number; totals: { debit: number; credit: number; balance: number } }> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const activeStoreId = await resolveErpStoreId(filters?.storeId);

  let query = supabase
    .from("erp_account_transactions")
    .select(
      "id, transaction_date, transaction_type, details, payment_type, debit_amount, credit_amount, running_balance, store_id, account_id",
    )
    .order("transaction_date", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(filters?.limit ?? 500);

  if (activeStoreId) query = query.eq("store_id", activeStoreId);
  if (filters?.accountId) query = query.eq("account_id", filters.accountId);
  if (filters?.dateFrom) query = query.gte("transaction_date", filters.dateFrom);
  if (filters?.dateTo) query = query.lte("transaction_date", filters.dateTo);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const accountIds = [
    ...new Set((data ?? []).map((r) => r.account_id).filter(Boolean)),
  ] as string[];
  const storeIds = [
    ...new Set((data ?? []).map((r) => r.store_id).filter(Boolean)),
  ] as string[];
  const accountNameById = new Map<string, string>();
  const storeNameById = new Map<string, string>();
  if (accountIds.length > 0) {
    const { data: accounts } = await supabase
      .from("accounts")
      .select("id, name")
      .in("id", accountIds);
    for (const a of accounts ?? []) accountNameById.set(a.id, a.name);
  }
  if (storeIds.length > 0) {
    const { data: stores } = await supabase
      .from("stores")
      .select("id, name")
      .in("id", storeIds);
    for (const s of stores ?? []) storeNameById.set(s.id, s.name);
  }

  let rows = (data ?? []).map((row) => ({
      id: row.id,
      transaction_date: row.transaction_date,
      store_name: row.store_id ? (storeNameById.get(row.store_id) ?? null) : null,
      account_name: row.account_id
        ? (accountNameById.get(row.account_id) ?? "—")
        : "—",
      transaction_type: row.transaction_type,
      details: row.details,
      payment_type: row.payment_type,
      debit_amount: Number(row.debit_amount),
      credit_amount: Number(row.credit_amount),
      running_balance: row.running_balance != null ? Number(row.running_balance) : null,
    }));

  if (filters?.search?.trim()) {
    const q = filters.search.trim().toLowerCase();
    rows = rows.filter(
      (r) =>
        r.details.toLowerCase().includes(q) ||
        r.account_name.toLowerCase().includes(q) ||
        (r.store_name?.toLowerCase().includes(q) ?? false) ||
        r.transaction_type.toLowerCase().includes(q),
    );
  }

  const debit = rows.reduce((s, r) => s + r.debit_amount, 0);
  const credit = rows.reduce((s, r) => s + r.credit_amount, 0);
  const lastBalance = rows.length > 0 ? rows[rows.length - 1].running_balance ?? 0 : 0;

  let openingBalance = 0;
  if (filters?.accountId) {
    const account = await getBankingAccount(filters.accountId);
    openingBalance = account?.opening_balance ?? 0;
  }

  return {
    rows,
    openingBalance,
    totals: { debit, credit, balance: Number(lastBalance) || openingBalance + debit - credit },
  };
}

export async function listProfitWithdrawals(filters?: {
  storeId?: string;
  accountId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  limit?: number;
}): Promise<ProfitWithdrawalRow[]> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const activeStoreId = await resolveErpStoreId(filters?.storeId);

  let query = supabase
    .from("erp_account_transactions")
    .select(
      "id, transaction_number, transaction_date, details, reference, credit_amount, payment_type, store_id, account_id, counter_account_id",
    )
    .eq("transaction_type", "profit_withdrawal")
    .order("transaction_date", { ascending: false })
    .limit(filters?.limit ?? 200);

  if (activeStoreId) query = query.eq("store_id", activeStoreId);
  if (filters?.accountId) query = query.eq("account_id", filters.accountId);
  if (filters?.dateFrom) query = query.gte("transaction_date", filters.dateFrom);
  if (filters?.dateTo) query = query.lte("transaction_date", filters.dateTo);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const accountIds = [
    ...new Set(
      (data ?? []).flatMap((r) => [r.account_id, r.counter_account_id].filter(Boolean)),
    ),
  ] as string[];
  const storeIds = [
    ...new Set((data ?? []).map((r) => r.store_id).filter(Boolean)),
  ] as string[];
  const accountNameById = new Map<string, string>();
  const storeNameById = new Map<string, string>();
  if (accountIds.length > 0) {
    const { data: accounts } = await supabase
      .from("accounts")
      .select("id, name")
      .in("id", accountIds);
    for (const a of accounts ?? []) accountNameById.set(a.id, a.name);
  }
  if (storeIds.length > 0) {
    const { data: stores } = await supabase
      .from("stores")
      .select("id, name")
      .in("id", storeIds);
    for (const s of stores ?? []) storeNameById.set(s.id, s.name);
  }

  let rows = (data ?? []).map((row) => ({
      id: row.id,
      transaction_number: row.transaction_number,
      transaction_date: row.transaction_date,
      store_name: row.store_id ? (storeNameById.get(row.store_id) ?? null) : null,
      from_account_name: row.account_id
        ? (accountNameById.get(row.account_id) ?? "—")
        : "—",
      to_account_name: row.counter_account_id
        ? (accountNameById.get(row.counter_account_id) ?? "Drawings")
        : "Drawings",
      reference: row.reference,
      details: row.details,
      amount: Number(row.credit_amount),
      payment_type: row.payment_type,
    }));

  if (filters?.search?.trim()) {
    const q = filters.search.trim().toLowerCase();
    rows = rows.filter(
      (r) =>
        r.transaction_number.toLowerCase().includes(q) ||
        r.from_account_name.toLowerCase().includes(q) ||
        (r.reference?.toLowerCase().includes(q) ?? false) ||
        r.details.toLowerCase().includes(q),
    );
  }

  return rows;
}

export async function createAccountTransaction(input: {
  accountId: string;
  storeId?: string;
  transactionDate: string;
  transactionType: string;
  debitAmount?: number;
  creditAmount?: number;
  counterAccountId?: string;
  details?: string;
  paymentType?: string;
  reference?: string;
}): Promise<string> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const storeId = await requireErpStoreId(input.storeId);

  const { data, error } = await supabase.rpc("create_erp_account_transaction", {
    p_account_id: input.accountId,
    p_store_id: storeId,
    p_transaction_date: input.transactionDate,
    p_transaction_type: input.transactionType,
    p_debit_amount: input.debitAmount ?? 0,
    p_credit_amount: input.creditAmount ?? 0,
    p_counter_account_id: input.counterAccountId ?? undefined,
    p_details: input.details ?? undefined,
    p_payment_type: input.paymentType ?? undefined,
    p_reference: input.reference ?? undefined,
  });
  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "account_transaction",
    entityType: "banking_transaction",
    entityId: data as string,
    description: input.transactionType,
    storeId,
  });

  return data as string;
}

export async function createProfitWithdrawal(input: {
  storeId: string;
  fromAccountId: string;
  transactionDate: string;
  amount: number;
  paymentType?: string;
  reference?: string;
  description?: string;
  counterAccountId?: string;
}): Promise<string> {
  if (input.amount <= 0) throw new Error("Amount must be greater than zero");

  return createAccountTransaction({
    accountId: input.fromAccountId,
    storeId: input.storeId,
    transactionDate: input.transactionDate,
    transactionType: "profit_withdrawal",
    creditAmount: input.amount,
    counterAccountId: input.counterAccountId,
    details: input.description ?? "Profit withdrawal",
    paymentType: input.paymentType ?? "Cash",
    reference: input.reference,
  });
}
