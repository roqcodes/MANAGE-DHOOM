import { NextResponse } from "next/server";

import type { UserProfile } from "@/common/auth/types";
import { UserRole } from "@/common/auth/types";
import { canAccessRolePath } from "@/modules/auth/access.control";
import { AUTH_ROUTES } from "@/modules/auth/services/auth-route.service";
import { getCurrentSessionProfile } from "@/modules/auth/services/auth.service";

function isVendorAreaRole(role: UserRole | null): boolean {
  return role === UserRole.Vendor;
}

export function vendorUnauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function vendorForbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/** Same rules as `requireVendorAreaAccess`, but JSON errors for Route Handlers. */
export async function requireVendorApiProfile(): Promise<
  | { ok: true; profile: UserProfile }
  | { ok: false; response: NextResponse }
> {
  const { user, profile } = await getCurrentSessionProfile();

  if (!user || !profile) {
    return { ok: false, response: vendorUnauthorized() };
  }

  if (!profile.is_verified || !profile.role) {
    return { ok: false, response: vendorUnauthorized() };
  }

  if (!isVendorAreaRole(profile.role)) {
    return { ok: false, response: vendorForbidden() };
  }

  if (!canAccessRolePath(AUTH_ROUTES.vendor, profile.role)) {
    return { ok: false, response: vendorForbidden() };
  }

  return { ok: true, profile };
}
