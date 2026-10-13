import "server-only";

import { redirect } from "next/navigation";

import { UserRole } from "@/common/auth/types";
import {
  canAccessRolePath,
  getAccessRedirectPath,
} from "@/modules/auth/access.control";
import {
  AUTH_ROUTES,
  getDashboardRouteForRole,
} from "@/modules/auth/services/auth-route.service";
import { getCurrentSessionProfile } from "@/modules/auth/services/auth.service";
import { isAdminAreaRole } from "@/modules/rbac/lib/admin-area";
import {
  canReadAdminPath,
  firstAllowedAdminHref,
} from "@/modules/rbac/lib/permission-catalog";

export async function redirectFromRoot() {
  const { user, profile } = await getCurrentSessionProfile();

  if (!user) {
    redirect(AUTH_ROUTES.signIn);
  }

  if (!profile) {
    redirect(AUTH_ROUTES.signIn);
  }

  redirect(getAccessRedirectPath(profile));
}

export async function redirectAuthenticatedUsersFromAuth() {
  const { user, profile } = await getCurrentSessionProfile();

  if (!user || !profile) {
    return;
  }

  redirect(getAccessRedirectPath(profile));
}

export async function requireRoleAccess(role: UserRole, path: string) {
  const { user, profile } = await getCurrentSessionProfile();

  if (!user || !profile) {
    redirect(AUTH_ROUTES.signIn);
  }

  if (!profile.is_verified || !profile.role) {
    redirect(getAccessRedirectPath(profile));
  }

  if (!canAccessRolePath(path, profile.role)) {
    redirect(getDashboardRouteForRole(profile.role));
  }

  if (profile.role !== role) {
    redirect(getDashboardRouteForRole(profile.role));
  }

  return profile;
}

/** ERP staff: `/admin` app shell with per-page RBAC. */
export async function requireAdminAreaAccess(pathname?: string) {
  const { user, profile } = await getCurrentSessionProfile();

  if (!user || !profile) {
    redirect(AUTH_ROUTES.signIn);
  }

  if (!profile.is_verified || !profile.role) {
    redirect(getAccessRedirectPath(profile));
  }

  if (!isAdminAreaRole(profile.role)) {
    redirect(getDashboardRouteForRole(profile.role));
  }

  if (!canAccessRolePath(AUTH_ROUTES.admin, profile.role)) {
    redirect(getDashboardRouteForRole(profile.role));
  }

  const path = pathname ?? AUTH_ROUTES.admin;
  const href = path.split("?")[0] ?? path;
  if (
    href.startsWith(AUTH_ROUTES.admin) &&
    href.length > AUTH_ROUTES.admin.length &&
    !canReadAdminPath(profile.rbac, href)
  ) {
    redirect(firstAllowedAdminHref(profile.rbac));
  }

  return profile;
}

export async function requireVendorAreaAccess() {
  const { user, profile } = await getCurrentSessionProfile();

  if (!user || !profile) {
    redirect(AUTH_ROUTES.signIn);
  }

  if (!profile.is_verified || !profile.role) {
    redirect(getAccessRedirectPath(profile));
  }

  if (profile.role !== UserRole.Vendor) {
    redirect(getDashboardRouteForRole(profile.role));
  }

  if (!canAccessRolePath(AUTH_ROUTES.vendor, profile.role)) {
    redirect(getDashboardRouteForRole(profile.role));
  }

  return profile;
}

export async function requirePendingProfile() {
  const { user, profile } = await getCurrentSessionProfile();

  if (!user || !profile) {
    redirect(AUTH_ROUTES.signIn);
  }

  if (profile.is_verified) {
    redirect(getAccessRedirectPath(profile));
  }

  return profile;
}
