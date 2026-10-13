import "server-only";

import { ADMIN_AREA_ROLES, UserRole } from "@/common/auth/types";
import {
  requireAdminAreaStaffProfile,
  requireSuperAdminProfile,
} from "@/modules/admin/services/rbac.service";
import { permissionKeyForHref } from "@/modules/rbac/lib/permission-catalog";
import { createRbacSupabaseClient } from "@/modules/rbac/lib/rbac-supabase";

export type RbacRoleRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  kind: "system" | "custom";
  portal_role: string;
  is_preset: boolean;
  sort_order: number;
};

export type RbacPermissionRow = {
  permission_key: string;
  store_id: string | null;
  can_read: boolean;
  can_write: boolean;
};

export async function listRbacRoles(): Promise<RbacRoleRow[]> {
  await requireSuperAdminProfile();
  const supabase = await createRbacSupabaseClient();
  const { data, error } = await supabase
    .from("rbac_roles")
    .select(
      "id,slug,name,description,kind,portal_role,is_preset,sort_order",
    )
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as RbacRoleRow[];
}

export async function getRbacRolePermissions(
  roleId: string,
): Promise<RbacPermissionRow[]> {
  await requireSuperAdminProfile();
  const supabase = await createRbacSupabaseClient();
  const { data, error } = await supabase
    .from("rbac_role_permissions")
    .select("permission_key,store_id,can_read,can_write")
    .eq("role_id", roleId);

  if (error) throw new Error(error.message);
  return (data ?? []) as RbacPermissionRow[];
}

export async function upsertCustomRbacRole(input: {
  name: string;
  description?: string;
  roleId?: string | null;
}): Promise<string> {
  await requireSuperAdminProfile();
  const supabase = await createRbacSupabaseClient();
  const { data, error } = await supabase.rpc("rbac_upsert_custom_role", {
    p_name: input.name,
    p_description: input.description ?? "",
    p_role_id: input.roleId ?? null,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function setRbacPermission(input: {
  roleId: string;
  permissionKey: string;
  canRead: boolean;
  canWrite: boolean;
  storeId?: string | null;
}): Promise<void> {
  await requireSuperAdminProfile();
  const supabase = await createRbacSupabaseClient();
  const { error } = await supabase.rpc("rbac_set_permission", {
    p_role_id: input.roleId,
    p_permission_key: input.permissionKey,
    p_can_read: input.canRead,
    p_can_write: input.canWrite,
    p_store_id: input.storeId ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function deleteCustomRbacRole(roleId: string): Promise<void> {
  await requireSuperAdminProfile();
  const supabase = await createRbacSupabaseClient();
  const { error } = await supabase.rpc("rbac_delete_custom_role", {
    p_role_id: roleId,
  });
  if (error) throw new Error(error.message);
}

export async function assignUserRbac(input: {
  userId: string;
  roleId: string;
  storeIds?: string[] | null;
  defaultStoreId?: string | null;
}): Promise<void> {
  await requireSuperAdminProfile();
  const supabase = await createRbacSupabaseClient();
  const { error } = await supabase.rpc("rbac_assign_user", {
    p_user_id: input.userId,
    p_role_id: input.roleId,
    p_store_ids: input.storeIds ?? null,
    p_default_store_id: input.defaultStoreId ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function listRbacAssignableRoles(): Promise<RbacRoleRow[]> {
  const profile = await requireAdminAreaStaffProfile();
  if (!profile.rbac?.canManageRoles) {
    throw new Error("Forbidden.");
  }
  return listRbacRoles();
}

export async function listStaffUsersForRbac(page = 0) {
  await requireSuperAdminProfile();
  const supabase = await createRbacSupabaseClient();
  const pageSize = 50;
  const from = page * pageSize;
  const roles = ADMIN_AREA_ROLES as UserRole[];

  const { data, error, count } = await supabase
    .from("users")
    .select("id,name,email,phone,role,is_verified,created_at", {
      count: "exact",
    })
    .in("role", roles)
    .eq("is_verified", true)
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) throw new Error(error.message);
  return { data: data ?? [], total: count ?? 0 };
}

export async function getUserStoreAccess(userId: string): Promise<string[]> {
  await requireSuperAdminProfile();
  const supabase = await createRbacSupabaseClient();
  const { data, error } = await supabase
    .from("user_store_access")
    .select("store_id")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.store_id).filter(Boolean) as string[];
}

export function permissionKeyFromAdminHref(href: string): string {
  return permissionKeyForHref(href);
}
