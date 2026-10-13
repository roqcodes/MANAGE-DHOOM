import "server-only";

import { UserRole, type UserProfile } from "@/common/auth/types";
import { isAdminAreaRole } from "@/modules/rbac/lib/admin-area";
import { getCurrentSessionProfile } from "@/modules/auth/services/auth.service";
import {
  canReadAdminPath,
  canWritePage,
  type RbacSession,
} from "@/modules/rbac/lib/permission-catalog";

export async function requireAdminAreaStaffProfile(): Promise<UserProfile> {
  const { profile } = await getCurrentSessionProfile();
  if (!profile?.role || !isAdminAreaRole(profile.role)) {
    throw new Error("Unauthorized.");
  }
  return profile;
}

/** @deprecated Use `requireAdminAreaStaffProfile` — kept for existing ERP services. */
export async function requireAdminOrManagerProfile(): Promise<UserProfile> {
  return requireAdminAreaStaffProfile();
}

export async function requireAdminOnlyProfile(): Promise<UserProfile> {
  const { profile } = await getCurrentSessionProfile();
  if (
    !profile?.role ||
    (profile.role !== UserRole.Admin && profile.role !== UserRole.SuperAdmin)
  ) {
    throw new Error("Unauthorized: admin only.");
  }
  return profile;
}

export async function requireSuperAdminProfile(): Promise<UserProfile> {
  const { profile } = await getCurrentSessionProfile();
  if (profile?.role !== UserRole.SuperAdmin && !profile?.rbac?.isSuperAdmin) {
    throw new Error("Unauthorized: super admin only.");
  }
  return profile!;
}

export function requireRbacRead(
  profile: UserProfile,
  adminPath: string,
  storeId?: string | null,
): void {
  if (!canReadAdminPath(profile.rbac, adminPath, storeId)) {
    throw new Error("Forbidden.");
  }
}

export function requireRbacWrite(
  profile: UserProfile,
  href: string,
  storeId?: string | null,
): void {
  if (!canWritePage(profile.rbac, href, storeId)) {
    throw new Error("Forbidden.");
  }
}

export function sessionCanManageRoles(rbac: RbacSession | null | undefined): boolean {
  return Boolean(rbac?.canManageRoles || rbac?.isSuperAdmin);
}

/** Supply-side portal: `users.id` matches `vendors.id` for portal vendor accounts. */
export async function requireVendorProfile() {
  const { profile } = await getCurrentSessionProfile();
  if (!profile?.role || profile.role !== UserRole.Vendor) {
    throw new Error("Unauthorized.");
  }
  return profile;
}
