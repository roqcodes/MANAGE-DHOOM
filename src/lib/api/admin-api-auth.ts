import { NextResponse } from "next/server";

import type { User } from "@supabase/supabase-js";

import type { UserProfile } from "@/common/auth/types";
import { UserRole } from "@/common/auth/types";
import { canAccessRolePath } from "@/modules/auth/access.control";
import { AUTH_ROUTES } from "@/modules/auth/services/auth-route.service";
import { getCurrentSessionProfile } from "@/modules/auth/services/auth.service";
import { SupabaseConnectivityError } from "@/lib/integrations/supabase/connectivity-error";

function isAdminAreaRole(role: UserRole | null): boolean {
  return role === UserRole.Admin || role === UserRole.Manager;
}

export function adminUnauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function adminForbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export function adminServiceUnavailable(message?: string) {
  return NextResponse.json(
    { error: message ?? "Could not reach the server. Check your network and try again." },
    { status: 503 },
  );
}

/** Same rules as `requireAdminAreaAccess`, but JSON errors for Route Handlers. */
export async function requireAdminApiProfile(): Promise<
  | { ok: true; profile: UserProfile; user: User }
  | { ok: false; response: NextResponse }
> {
  let user: User | null;
  let profile: UserProfile | null;

  try {
    ({ user, profile } = await getCurrentSessionProfile());
  } catch (error) {
    if (error instanceof SupabaseConnectivityError) {
      return { ok: false, response: adminServiceUnavailable(error.message) };
    }
    throw error;
  }

  if (!user || !profile) {
    return { ok: false, response: adminUnauthorized() };
  }

  if (!profile.is_verified || !profile.role) {
    return { ok: false, response: adminUnauthorized() };
  }

  if (!isAdminAreaRole(profile.role)) {
    return { ok: false, response: adminForbidden() };
  }

  if (!canAccessRolePath(AUTH_ROUTES.admin, profile.role)) {
    return { ok: false, response: adminForbidden() };
  }

  return { ok: true, profile, user };
}
