import "server-only";

import type { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import {
  duplicateMasterNameError,
  rethrowUniqueNameViolation,
  trimMasterName,
} from "@/lib/erp/master-name-messages";

export { duplicateMasterNameError, rethrowUniqueNameViolation, trimMasterName };

type SupabaseServer = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type MasterNameTable =
  | "vendors"
  | "products"
  | "brands"
  | "stores"
  | "users"
  | "categories"
  | "product_variants"
  | "variant_groups"
  | "erp_employees"
  | "accounts"
  | "account_types";

function escapeIlikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function namesMatchCaseInsensitive(a: string, b: string): boolean {
  return trimMasterName(a).toLowerCase() === trimMasterName(b).toLowerCase();
}

async function findNameConflict(
  supabase: SupabaseServer,
  options: {
    table: MasterNameTable;
    column: string;
    name: string;
    excludeId?: string;
    applyScope?: (query: {
      eq: (col: string, val: string) => unknown;
      is: (col: string, val: null) => unknown;
      not: (col: string, op: string, val: null) => unknown;
    }) => unknown;
  },
): Promise<boolean> {
  const trimmed = trimMasterName(options.name);
  if (!trimmed) return false;

  let query = supabase
    .from(options.table)
    .select(`id, ${options.column}`)
    .ilike(options.column, escapeIlikePattern(trimmed))
    .limit(20);

  if (options.excludeId) {
    query = query.neq("id", options.excludeId);
  }
  if (options.applyScope) {
    options.applyScope(query);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).some((row) => {
    const raw = row[options.column as keyof typeof row];
    const existing = typeof raw === "string" ? raw : String(raw ?? "");
    return namesMatchCaseInsensitive(existing, trimmed);
  });
}

export async function assertUniqueVendorName(
  supabase: SupabaseServer,
  name: string,
  excludeId?: string,
): Promise<void> {
  if (await findNameConflict(supabase, { table: "vendors", column: "name", name, excludeId })) {
    throw new Error(duplicateMasterNameError("vendor"));
  }
}

export async function assertUniqueProductName(
  supabase: SupabaseServer,
  name: string,
  excludeId?: string,
): Promise<void> {
  if (await findNameConflict(supabase, { table: "products", column: "name", name, excludeId })) {
    throw new Error(duplicateMasterNameError("product"));
  }
}

export async function assertUniqueBrandName(
  supabase: SupabaseServer,
  name: string,
  excludeId?: string,
): Promise<void> {
  if (await findNameConflict(supabase, { table: "brands", column: "name", name, excludeId })) {
    throw new Error(duplicateMasterNameError("brand"));
  }
}

export async function assertUniqueStoreName(
  supabase: SupabaseServer,
  name: string,
  excludeId?: string,
): Promise<void> {
  if (await findNameConflict(supabase, { table: "stores", column: "name", name, excludeId })) {
    throw new Error(duplicateMasterNameError("store"));
  }
}

export async function assertUniqueCustomerCompanyName(
  supabase: SupabaseServer,
  companyName: string,
  excludeUserId?: string,
): Promise<void> {
  const trimmed = trimMasterName(companyName);
  if (!trimmed) return;

  if (
    await findNameConflict(supabase, {
      table: "users",
      column: "company_name",
      name: trimmed,
      excludeId: excludeUserId,
      applyScope: (q) => q.not("customer_number", "is", null),
    })
  ) {
    throw new Error(duplicateMasterNameError("customer"));
  }
}

export async function assertUniqueCategoryName(
  supabase: SupabaseServer,
  name: string,
  parentId: string | null,
  excludeId?: string,
): Promise<void> {
  if (
    await findNameConflict(supabase, {
      table: "categories",
      column: "name",
      name,
      excludeId,
      applyScope: (q) =>
        parentId ? q.eq("parent_id", parentId) : q.is("parent_id", null),
    })
  ) {
    throw new Error(duplicateMasterNameError("category"));
  }
}

export async function assertUniqueVariantName(
  supabase: SupabaseServer,
  productId: string,
  name: string,
  excludeVariantId?: string,
): Promise<void> {
  if (
    await findNameConflict(supabase, {
      table: "product_variants",
      column: "name",
      name,
      excludeId: excludeVariantId,
      applyScope: (q) => q.eq("product_id", productId),
    })
  ) {
    throw new Error(duplicateMasterNameError("variant"));
  }
}

export async function assertUniqueVariantGroupName(
  supabase: SupabaseServer,
  productId: string,
  name: string,
  excludeGroupId?: string,
): Promise<void> {
  if (
    await findNameConflict(supabase, {
      table: "variant_groups",
      column: "name",
      name,
      excludeId: excludeGroupId,
      applyScope: (q) => q.eq("product_id", productId),
    })
  ) {
    throw new Error(duplicateMasterNameError("variant group"));
  }
}

export async function assertUniqueEmployeeFullName(
  supabase: SupabaseServer,
  fullName: string,
  excludeEmployeeId?: string,
): Promise<void> {
  if (
    await findNameConflict(supabase, {
      table: "erp_employees",
      column: "full_name",
      name: fullName,
      excludeId: excludeEmployeeId,
    })
  ) {
    throw new Error(duplicateMasterNameError("employee"));
  }
}

export async function assertUniqueAccountName(
  supabase: SupabaseServer,
  name: string,
  excludeAccountId?: string,
): Promise<void> {
  if (
    await findNameConflict(supabase, {
      table: "accounts",
      column: "name",
      name,
      excludeId: excludeAccountId,
    })
  ) {
    throw new Error(duplicateMasterNameError("account"));
  }
}

export async function assertUniqueAccountTypeName(
  supabase: SupabaseServer,
  accountCategory: string,
  name: string,
  excludeTypeId?: string,
): Promise<void> {
  if (
    await findNameConflict(supabase, {
      table: "account_types",
      column: "name",
      name,
      excludeId: excludeTypeId,
      applyScope: (q) => q.eq("account_category", accountCategory),
    })
  ) {
    throw new Error(duplicateMasterNameError("account type"));
  }
}

