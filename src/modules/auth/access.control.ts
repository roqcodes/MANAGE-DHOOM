import { UserRole, type UserProfile } from "@/common/auth/types";
import {
  AUTH_ROUTES,
  getDashboardRouteForRole,
} from "@/modules/auth/services/auth-route.service";

export const AUTH_PUBLIC_PATHS = [
  AUTH_ROUTES.signIn,
  AUTH_ROUTES.signUp,
  AUTH_ROUTES.pendingApproval,
] as const;

const ROLE_ROOTS: Record<UserRole, string> = {
  [UserRole.Admin]: AUTH_ROUTES.admin,
  [UserRole.Manager]: AUTH_ROUTES.admin,
  [UserRole.Vendor]: AUTH_ROUTES.vendor,
  [UserRole.Delivery]: AUTH_ROUTES.delivery,
};

export function isPublicAuthPath(pathname: string): boolean {
  return AUTH_PUBLIC_PATHS.includes(
    pathname as (typeof AUTH_PUBLIC_PATHS)[number],
  );
}

export function canAccessAuthSurface(profile?: UserProfile | null): boolean {
  return !profile?.role || !profile.is_verified;
}

export function isProtectedRolePath(pathname: string): boolean {
  return (
    pathname.startsWith(AUTH_ROUTES.admin) ||
    pathname.startsWith(AUTH_ROUTES.vendor) ||
    pathname.startsWith(AUTH_ROUTES.delivery)
  );
}

export function canAccessRolePath(
  pathname: string,
  role: UserRole,
): boolean {
  return pathname.startsWith(ROLE_ROOTS[role]);
}

export function getAccessRedirectPath(profile: UserProfile): string {
  if (!profile.is_verified) {
    return AUTH_ROUTES.pendingApproval;
  }

  if (!profile.role) {
    return AUTH_ROUTES.signIn;
  }

  return getDashboardRouteForRole(profile.role);
}
