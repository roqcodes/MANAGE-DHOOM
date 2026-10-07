import "server-only";

import { redirect } from "next/navigation";

import { UserRole } from "@/common/auth/types";

function isAdminAreaRole(role: UserRole | null): boolean {
  return role === UserRole.Admin || role === UserRole.Manager;
}
import {
  canAccessRolePath,
  getAccessRedirectPath,
} from "@/modules/auth/access.control";
import {
  AUTH_ROUTES,
  getDashboardRouteForRole,
} from "@/modules/auth/services/auth-route.service";
import { getCurrentSessionProfile } from "@/modules/auth/services/auth.service";

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

/** Admin + Manager: full `/admin` app shell. */
export async function requireAdminAreaAccess() {
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
