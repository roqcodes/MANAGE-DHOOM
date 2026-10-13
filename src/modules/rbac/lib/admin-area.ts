import { ADMIN_AREA_ROLES, UserRole } from "@/common/auth/types";

const ADMIN_AREA_SET = new Set<string>(ADMIN_AREA_ROLES);

export function isAdminAreaRole(role: UserRole | string | null | undefined): boolean {
  return Boolean(role && ADMIN_AREA_SET.has(role));
}

export function isSuperAdminProfile(
  profile: { role?: UserRole | null; rbac?: { isSuperAdmin?: boolean } | null } | null,
): boolean {
  return (
    profile?.role === UserRole.SuperAdmin || profile?.rbac?.isSuperAdmin === true
  );
}
