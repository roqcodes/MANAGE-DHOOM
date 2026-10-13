import "server-only";

import { UserRole } from "@/common/auth/types";
import {
  requireAdminOnlyProfile,
  requireAdminOrManagerProfile,
  requireSuperAdminProfile,
} from "@/modules/admin/services/rbac.service";
import { assignUserRbac } from "@/modules/rbac/services/rbac-admin.service";
import { createRbacSupabaseClient } from "@/modules/rbac/lib/rbac-supabase";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import {
  ASSIGNABLE_ERP_STAFF_ROLES,
  PORTAL_ACCESS_REQUEST_ROLE,
} from "@/modules/users/lib/portal-staff-roles";
import { assertStaffPortalRegistrationAvailable } from "@/modules/users/services/portal-email-policy.service";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import type { Database } from "@/lib/integrations/supabase/types";
import {
  deactivateVendorRowForUser,
  deleteVendorRowForUser,
  syncVendorRowFromUser,
} from "@/modules/vendors/services/vendor-user-sync.service";
import {
  assertCanPromoteUserToStaff,
  isStaffRole,
  isStoreCustomerRole,
} from "@/modules/users/services/customer-storefront-activity.service";

const ASSIGNABLE_LEGACY_ROLES: readonly string[] = [UserRole.Vendor];

export async function verifyUserById(userId: string): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data: row, error } = await supabase
    .from("users")
    .update({ is_verified: true })
    .eq("id", userId)
    .select("role")
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (row?.role === UserRole.Vendor) {
    await syncVendorRowFromUser(userId);
  }
}

export async function rejectUserById(userId: string): Promise<void> {
  await requireAdminOnlyProfile();
  const supabase = await createSupabaseServerClient();
  await deleteVendorRowForUser(userId).catch(() => undefined);

  const { error } = await supabase.from("users").delete().eq("id", userId);
  if (error) throw new Error(error.message);
}

export async function assignErpStaffRoleByRbacSlug(
  userId: string,
  rbacSlug: string,
): Promise<void> {
  await requireSuperAdminProfile();
  const allowed = ASSIGNABLE_ERP_STAFF_ROLES.some((r) => r.rbacSlug === rbacSlug);
  if (!allowed) {
    throw new Error("Invalid role.");
  }

  const supabase = await createRbacSupabaseClient();
  const { data: roleRow, error } = await supabase
    .from("rbac_roles")
    .select("id")
    .eq("slug", rbacSlug)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!roleRow?.id) {
    throw new Error("Role is not configured. Apply RBAC database migrations.");
  }

  await assignUserRbac({
    userId,
    roleId: String((roleRow as { id: string }).id),
  });
}

export async function assignStaffAccessById(input: {
  userId: string;
  roleId: string;
  storeIds?: string[];
  defaultStoreId?: string | null;
}): Promise<void> {
  await requireSuperAdminProfile();
  await assignUserRbac({
    userId: input.userId,
    roleId: input.roleId,
    storeIds: input.storeIds,
    defaultStoreId: input.defaultStoreId,
  });
}

export async function getPortalUserPurgeEligibility(
  userId: string,
): Promise<{ eligible: boolean; reason: string | null }> {
  await requireSuperAdminProfile();
  const supabase = await createRbacSupabaseClient();
  const { data, error } = await supabase.rpc("portal_user_purge_eligibility", {
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);
  const row = data as { eligible?: boolean; reason?: string | null } | null;
  return {
    eligible: row?.eligible === true,
    reason: row?.reason ?? null,
  };
}

export async function purgeInactivePortalUserBySuperAdmin(
  userId: string,
): Promise<void> {
  await requireSuperAdminProfile();

  const admin = createSupabaseAdminClient();
  if (!admin) {
    throw new Error("User purge is not configured (missing service role).");
  }

  const supabase = await createRbacSupabaseClient();
  const { error: purgeError } = await supabase.rpc(
    "super_admin_purge_inactive_portal_user",
    { p_user_id: userId },
  );
  if (purgeError) throw new Error(purgeError.message);

  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  if (authError) {
    throw new Error(
      `Profile removed but auth account may remain: ${authError.message}`,
    );
  }
}

export async function createStaffPortalUserBySuperAdmin(input: {
  name: string;
  email: string;
  password: string;
  phone?: string;
  roleId: string;
  storeIds?: string[];
  defaultStoreId?: string | null;
}): Promise<{ userId: string }> {
  await requireSuperAdminProfile();

  const admin = createSupabaseAdminClient();
  if (!admin) {
    throw new Error("Staff provisioning is not configured (missing service role).");
  }

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone?.trim() || "—";
  const password = input.password;

  if (!name || !email || password.length < 8) {
    throw new Error("Name, email, and a password of at least 8 characters are required.");
  }

  await assertStaffPortalRegistrationAvailable(admin, email, phone);

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });

  if (authError || !authData.user) {
    throw new Error(authError?.message ?? "Could not create auth account.");
  }

  const userId = authData.user.id;

  try {
    const { error: profileError } = await admin.rpc("create_portal_access_profile", {
      p_user_id: userId,
      p_name: name,
      p_email: email,
      p_phone: phone,
      p_role: PORTAL_ACCESS_REQUEST_ROLE,
    });

    if (profileError) {
      throw new Error(profileError.message);
    }

    await assignUserRbac({
      userId,
      roleId: input.roleId,
      storeIds: input.storeIds,
      defaultStoreId: input.defaultStoreId,
    });

    const { error: verifyError } = await admin
      .from("users")
      .update({ is_verified: true })
      .eq("id", userId);

    if (verifyError) {
      throw new Error(verifyError.message);
    }

    return { userId };
  } catch (e) {
    await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    throw e instanceof Error ? e : new Error(String(e));
  }
}

export async function updateUserRoleById(
  userId: string,
  newRole: string,
): Promise<void> {
  await requireAdminOnlyProfile();
  if (!ASSIGNABLE_LEGACY_ROLES.includes(newRole)) {
    throw new Error("Invalid role. ERP roles are assigned by a super admin.");
  }

  const supabase = await createSupabaseServerClient();

  const { data: before } = await supabase
    .from("users")
    .select("role,is_verified")
    .eq("id", userId)
    .maybeSingle();

  if (isStoreCustomerRole(before?.role) && isStaffRole(newRole)) {
    await assertCanPromoteUserToStaff(userId);
  }

  const { error } = await supabase
    .from("users")
    .update({ role: newRole as Database["public"]["Enums"]["user_role"] })
    .eq("id", userId);

  if (error) throw new Error(error.message);

  if (before?.role === UserRole.Vendor && newRole !== UserRole.Vendor) {
    await deactivateVendorRowForUser(userId);
  }

  if (newRole === UserRole.Vendor && before?.is_verified) {
    await syncVendorRowFromUser(userId);
  }
}
