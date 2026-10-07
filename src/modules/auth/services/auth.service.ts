import "server-only";

import { cache } from "react";
import type { User } from "@supabase/supabase-js";

import {
  ALLOWED_PORTAL_ROLES,
  UserRole,
  type RequestAccessRole,
  type UserProfile,
} from "@/common/auth/types";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import {
  isSupabaseConnectivityError,
  SupabaseConnectivityError,
} from "@/lib/integrations/supabase/connectivity-error";
import { recordAuthAudit } from "@/modules/auth/services/auth-audit.service";
import {
  formatPortalAuthError,
  PORTAL_ACCESS_DENIED_MESSAGE,
  PORTAL_CUSTOMER_DENIED_MESSAGE,
  PORTAL_PENDING_VERIFICATION_MESSAGE,
} from "@/modules/auth/lib/format-auth-error";
import { assertEmailAvailableForStaffPortal } from "@/modules/users/services/portal-email-policy.service";

const allowedAdminRoles = new Set<UserRole>(ALLOWED_PORTAL_ROLES);

function normalizeUserProfile(profile: {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  is_verified: boolean | null;
} | null): UserProfile | null {
  if (!profile) {
    return null;
  }

  const role = allowedAdminRoles.has(profile.role as UserRole)
    ? (profile.role as UserRole)
    : null;

  return {
    ...profile,
    role,
  };
}

/**
 * Loads portal profile from Postgres. Not wrapped in `unstable_cache` — that API
 * cannot call `cookies()` (via Supabase SSR client); use React `cache` on
 * `getCurrentSessionProfile` for per-request deduplication instead.
 */
export async function getUserProfileById(userId: string): Promise<UserProfile | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("users")
    .select("id,name,email,phone,role,is_verified")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return normalizeUserProfile(data);
}

export const getCurrentSessionProfile = cache(async () => {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError && isSupabaseConnectivityError(authError)) {
      throw new SupabaseConnectivityError(authError);
    }

    if (!user) {
      return {
        user: null,
        profile: null,
      };
    }

    const { data, error } = await supabase
      .from("users")
      .select("id,name,email,phone,role,is_verified")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      if (isSupabaseConnectivityError(error)) {
        throw new SupabaseConnectivityError(error);
      }
      throw new Error(error.message);
    }

    return {
      user,
      profile: normalizeUserProfile(data),
    };
  } catch (error) {
    if (error instanceof SupabaseConnectivityError) {
      throw error;
    }
    if (isSupabaseConnectivityError(error)) {
      throw new SupabaseConnectivityError(error);
    }
    throw error;
  }
});

export async function signInWithPassword(input: {
  email: string;
  password: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });

  if (error) {
    await recordAuthAudit({
      action: "sign_in",
      email: input.email,
      outcome: "failure",
      reason: error.message,
    });
    throw new Error(formatPortalAuthError(error, "sign-in"));
  }

  const user = data.user;

  if (!user) {
    await recordAuthAudit({
      action: "sign_in",
      email: input.email,
      outcome: "failure",
      reason: "Missing authenticated user after sign in.",
    });
    throw new Error("Unable to load your account.");
  }

  const profile = await getUserProfileById(user.id);

  if (!profile) {
    await supabase.auth.signOut();
    await recordAuthAudit({
      action: "sign_in",
      email: input.email,
      userId: user.id,
      outcome: "failure",
      reason: "Missing users profile after sign in.",
    });
    throw new Error("Your account profile could not be loaded.");
  }

  if (!profile.role) {
    await supabase.auth.signOut();
    await recordAuthAudit({
      action: "sign_in",
      email: input.email,
      userId: user.id,
      outcome: "failure",
      reason: "Storefront customer attempted portal sign-in.",
    });
    throw new Error(PORTAL_CUSTOMER_DENIED_MESSAGE);
  }

  if (!allowedAdminRoles.has(profile.role)) {
    await supabase.auth.signOut();
    await recordAuthAudit({
      action: "sign_in",
      email: input.email,
      userId: user.id,
      outcome: "failure",
      reason: "Role is not allowed for this admin application.",
    });
    throw new Error(PORTAL_ACCESS_DENIED_MESSAGE);
  }

  if (!profile.is_verified) {
    await supabase.auth.signOut();
    await recordAuthAudit({
      action: "sign_in",
      email: input.email,
      userId: user.id,
      role: profile.role,
      outcome: "failure",
      reason: "Staff account pending verification.",
    });
    throw new Error(PORTAL_PENDING_VERIFICATION_MESSAGE);
  }

  await recordAuthAudit({
    action: "sign_in",
    email: input.email,
    userId: user.id,
    role: profile.role,
    outcome: "success",
  });

  return {
    user,
    profile,
  };
}

export async function requestAccess(input: {
  name: string;
  email: string;
  phone: string;
  password: string;
  role: RequestAccessRole;
}) {
  const supabase = await createSupabaseServerClient();
  await assertEmailAvailableForStaffPortal(supabase, input.email);

  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
  });

  if (error) {
    await recordAuthAudit({
      action: "request_access",
      email: input.email,
      role: input.role,
      outcome: "failure",
      reason: error.message,
    });
    throw new Error(formatPortalAuthError(error, "request-access"));
  }

  const user = data.user;

  if (!user) {
    await recordAuthAudit({
      action: "request_access",
      email: input.email,
      role: input.role,
      outcome: "failure",
      reason: "Missing user after sign up.",
    });
    throw new Error("Unable to create your access request.");
  }

  const { error: profileError } = await supabase.from("users").insert({
    id: user.id,
    name: input.name,
    email: input.email,
    phone: input.phone,
    role: input.role,
    is_verified: false,
  });

  if (profileError) {
    await supabase.auth.signOut();
    await recordAuthAudit({
      action: "request_access",
      email: input.email,
      userId: user.id,
      role: input.role,
      outcome: "failure",
      reason: profileError.message,
    });
    throw new Error(profileError.message);
  }

  await supabase.auth.signOut();
  await recordAuthAudit({
    action: "request_access",
    email: input.email,
    userId: user.id,
    role: input.role,
    outcome: "success",
  });

  return {
    user,
  };
}

export async function requestPasswordReset(input: {
  email: string;
  redirectTo: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(input.email, {
    redirectTo: input.redirectTo,
  });

  if (error) {
    throw new Error(formatPortalAuthError(error, "sign-in"));
  }
}

export async function updateCurrentUserPassword(password: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in to change your password.");
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    throw new Error(formatPortalAuthError(error, "sign-in"));
  }
}

export async function signOutCurrentUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.auth.signOut();

  if (error) {
    await recordAuthAudit({
      action: "sign_out",
      userId: user?.id,
      outcome: "failure",
      reason: error.message,
    });
    throw new Error(error.message);
  }

  await recordAuthAudit({
    action: "sign_out",
    userId: user?.id,
    outcome: "success",
  });
}

export function isAllowedAdminRole(role: string | null): role is UserRole {
  return allowedAdminRoles.has(role as UserRole);
}

export function getDefaultDisplayName(user: User | null, profile: UserProfile | null) {
  return profile?.name || user?.email || "DHOOM Trading User";
}
