import "server-only";

import { UserRole } from "@/common/auth/types";
import {
  requireAdminOnlyProfile,
  requireAdminOrManagerProfile,
} from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
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

const ASSIGNABLE_ROLES: readonly string[] = [
  UserRole.Admin,
  UserRole.Vendor,
  UserRole.Delivery,
];

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

export async function updateUserRoleById(
  userId: string,
  newRole: string,
): Promise<void> {
  await requireAdminOnlyProfile();
  if (!ASSIGNABLE_ROLES.includes(newRole)) {
    throw new Error("Invalid role.");
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
