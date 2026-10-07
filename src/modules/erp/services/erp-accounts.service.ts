import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { invokeRpc } from "@/lib/integrations/supabase/rpc";
import type { AccountListRow, AccountTypeRow } from "@/common/erp/finance-types";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import {
  resolveErpStoreId,
  withAccountStoreScope,
} from "@/modules/erp/services/store-context.service";

export async function listAccountTypes(search?: string): Promise<AccountTypeRow[]> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("account_types")
    .select("id, account_category, name, description, is_system")
    .order("account_category")
    .order("name");

  const term = search?.trim();
  if (term) {
    query = query.or(
      `name.ilike.%${term}%,description.ilike.%${term}%,account_category.ilike.%${term}%`,
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createAccountType(input: {
  accountCategory: string;
  name: string;
  description?: string;
}): Promise<string> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("account_types")
    .insert({
      account_category: input.accountCategory,
      name: input.name,
      description: input.description ?? "",
      is_system: false,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await logAuditEvent({
    action: "create_account_type",
    entityType: "account_type",
    entityId: data.id,
    description: `Account type ${input.name} created`,
  });
  return data.id;
}

export async function updateAccountType(
  typeId: string,
  input: {
    accountCategory: string;
    name: string;
    description?: string;
  },
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data: type } = await supabase
    .from("account_types")
    .select("is_system")
    .eq("id", typeId)
    .single();
  if (type?.is_system) throw new Error("Cannot edit system account type");

  const { error } = await supabase
    .from("account_types")
    .update({
      account_category: input.accountCategory,
      name: input.name,
      description: input.description ?? "",
      updated_at: new Date().toISOString(),
    })
    .eq("id", typeId);
  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "update_account_type",
    entityType: "account_type",
    entityId: typeId,
    description: `Account type ${input.name} updated`,
  });
}

type AccountListFilters = {
  page?: number;
  limit?: number;
  search?: string;
  storeId?: string;
  includeBalance?: boolean;
};

function mapAccountRow(
  row: Record<string, unknown>,
  currentBalance = 0,
): AccountListRow {
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
    store_id: (row.store_id as string | null) ?? null,
    store_name: store?.name ?? null,
    is_system: row.is_system as boolean,
    is_locked: row.is_locked as boolean,
    is_active: row.is_active as boolean,
    opening_balance: Number(row.opening_balance ?? 0),
    current_balance: currentBalance,
  };
}

export async function listAccounts(
  filters: AccountListFilters = {},
): Promise<{ data: AccountListRow[]; total: number }> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const page = filters.page ?? 0;
  const limit = filters.limit ?? 50;
  const from = page * limit;
  const storeId = await resolveErpStoreId(filters.storeId);

  let query = supabase
    .from("accounts")
    .select(
      "id, code, name, description, account_type_id, store_id, is_system, is_locked, is_active, opening_balance, account_types(name, account_category), stores(name)",
      { count: "exact" },
    )
    .order("code");

  query = withAccountStoreScope(query, storeId);

  const term = filters.search?.trim();
  if (term) {
    query = query.or(
      `name.ilike.%${term}%,description.ilike.%${term}%,code.ilike.%${term}%`,
    );
  }

  const { data, error, count } = await query.range(from, from + limit - 1);
  if (error) throw new Error(error.message);

  const balanceByAccount = new Map<string, number>();
  if (filters.includeBalance && (data ?? []).length > 0) {
    const ids = (data ?? []).map((row) => row.id as string);
    const { data: balRows, error: balErr } = await invokeRpc(
      supabase,
      "get_account_balances",
      { p_account_ids: ids },
    );
    if (balErr) {
      for (const id of ids) {
        const { data: bal } = await supabase.rpc("get_account_balance", {
          p_account_id: id,
        });
        balanceByAccount.set(id, Number(bal ?? 0));
      }
    } else {
      for (const row of (balRows ?? []) as { account_id: string; balance: number }[]) {
        balanceByAccount.set(row.account_id, Number(row.balance ?? 0));
      }
    }
  }

  const rows: AccountListRow[] = [];
  for (const row of data ?? []) {
    const balance = filters.includeBalance
      ? (balanceByAccount.get(row.id as string) ?? 0)
      : 0;
    rows.push(mapAccountRow(row as Record<string, unknown>, balance));
  }

  return { data: rows, total: count ?? 0 };
}

export async function getAccountDetail(accountId: string) {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("accounts")
    .select("*, account_types(name, account_category), stores(name)")
    .eq("id", accountId)
    .single();
  if (error) throw new Error(error.message);
  const { data: balance } = await supabase.rpc("get_account_balance", { p_account_id: accountId });
  return { ...data, current_balance: Number(balance ?? 0) };
}

export async function createAccount(input: {
  accountTypeId: string;
  name: string;
  code: string;
  description?: string;
  storeId?: string;
  openingBalance?: number;
}): Promise<string> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const storeId = (await resolveErpStoreId(input.storeId)) ?? undefined;
  const { data, error } = await supabase.rpc("create_erp_account", {
    p_account_type_id: input.accountTypeId,
    p_name: input.name,
    p_code: input.code,
    p_description: input.description ?? undefined,
    p_store_id: storeId,
    p_opening_balance: input.openingBalance ?? 0,
  });
  if (error) throw new Error(error.message);
  await logAuditEvent({
    action: "create_account",
    entityType: "account",
    entityId: data as string,
    description: `Account ${input.code} created`,
    storeId,
  });
  return data as string;
}

export async function updateAccount(
  accountId: string,
  input: {
    name: string;
    code: string;
    description?: string;
    storeId?: string | null;
    openingBalance?: number;
    isActive?: boolean;
  },
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data: existing } = await supabase
    .from("accounts")
    .select("is_system, is_locked")
    .eq("id", accountId)
    .single();
  if (existing?.is_system || existing?.is_locked) {
    throw new Error("Cannot edit system or locked account");
  }

  const { error } = await supabase.rpc("update_erp_account", {
    p_account_id: accountId,
    p_name: input.name,
    p_code: input.code,
    p_description: input.description ?? "",
    p_store_id: input.storeId ?? null,
    p_opening_balance: input.openingBalance ?? 0,
    p_is_active: input.isActive ?? true,
  });
  if (error) throw new Error(error.message);
  await logAuditEvent({
    action: "update_account",
    entityType: "account",
    entityId: accountId,
    description: `Account ${input.code} updated`,
    storeId: input.storeId ?? undefined,
  });
}

export async function deleteAccountType(typeId: string): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data: type } = await supabase
    .from("account_types")
    .select("is_system, name")
    .eq("id", typeId)
    .single();
  if (type?.is_system) throw new Error("Cannot delete system account type");

  const { error } = await supabase.from("account_types").delete().eq("id", typeId);
  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "delete_account_type",
    entityType: "account_type",
    entityId: typeId,
    description: `Account type deleted: ${type?.name ?? typeId}`,
  });
}

export async function deleteAccount(accountId: string): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data: account } = await supabase
    .from("accounts")
    .select("is_system, is_locked, code, name")
    .eq("id", accountId)
    .single();
  if (account?.is_system || account?.is_locked) {
    throw new Error("Cannot delete system or locked account");
  }

  const { error } = await supabase.from("accounts").delete().eq("id", accountId);
  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "delete_account",
    entityType: "account",
    entityId: accountId,
    description: `Account deleted: ${account?.code ?? accountId} ${account?.name ?? ""}`.trim(),
  });
}
