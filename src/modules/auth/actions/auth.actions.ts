"use server";

import { redirect } from "next/navigation";

import {
  INITIAL_AUTH_ACTION_STATE,
  UserRole,
  type AuthActionState,
  type RequestAccessRole,
} from "@/common/auth/types";
import {
  getAccessRedirectPath,
  canAccessRolePath,
} from "@/modules/auth/access.control";
import { formatPortalAuthError } from "@/modules/auth/lib/format-auth-error";
import {
  AUTH_ROUTES,
  getDashboardRouteForRole,
} from "@/modules/auth/services/auth-route.service";
import {
  requestAccess,
  requestPasswordReset,
  signInWithPassword,
  signOutCurrentUser,
  updateCurrentUserPassword,
} from "@/modules/auth/services/auth.service";

function readTrimmedField(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getValidatedRole(value: string): RequestAccessRole | null {
  if (
    value === UserRole.Admin ||
    value === UserRole.Vendor ||
    value === UserRole.Delivery
  ) {
    return value;
  }

  return null;
}

function resolvePasswordResetRedirect(formData: FormData) {
  const fromForm = readTrimmedField(formData, "redirectTo");
  if (fromForm) return fromForm;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (siteUrl) return `${siteUrl}${AUTH_ROUTES.resetPassword}`;

  return AUTH_ROUTES.resetPassword;
}

export async function signInAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = readTrimmedField(formData, "email");
  const password = readTrimmedField(formData, "password");

  if (!email || !password) {
    return {
      ...INITIAL_AUTH_ACTION_STATE,
      errorMessage: "Enter both email and password.",
    };
  }

  try {
    const { profile } = await signInWithPassword({
      email,
      password,
    });

    if (!profile) {
      return {
        ...INITIAL_AUTH_ACTION_STATE,
        errorMessage: "Your account profile could not be loaded.",
      };
    }

    if (!profile.role) {
      return {
        ...INITIAL_AUTH_ACTION_STATE,
        errorMessage: formatPortalAuthError(
          "This account does not have access to the management portal.",
        ),
      };
    }

    redirect(getAccessRedirectPath(profile));
  } catch (error) {
    return {
      ...INITIAL_AUTH_ACTION_STATE,
      errorMessage: formatPortalAuthError(error, "sign-in"),
    };
  }
}

export async function requestAccessAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const name = readTrimmedField(formData, "name");
  const email = readTrimmedField(formData, "email");
  const phone = readTrimmedField(formData, "phone");
  const password = String(formData.get("password") ?? "");
  const role = getValidatedRole(readTrimmedField(formData, "role"));

  if (!name || !email || !phone || !password || !role) {
    return {
      ...INITIAL_AUTH_ACTION_STATE,
      errorMessage: "Fill in all fields to request access.",
    };
  }

  if (password.length < 8) {
    return {
      ...INITIAL_AUTH_ACTION_STATE,
      errorMessage: "Password must be at least 8 characters.",
    };
  }

  try {
    await requestAccess({
      name,
      email,
      phone,
      password,
      role,
    });

    return {
      ...INITIAL_AUTH_ACTION_STATE,
      successMessage:
        "Access requested. An administrator must verify your account before sign-in.",
    };
  } catch (error) {
    return {
      ...INITIAL_AUTH_ACTION_STATE,
      errorMessage: formatPortalAuthError(error, "request-access"),
    };
  }
}

export async function signOutAction() {
  await signOutCurrentUser();
  redirect(AUTH_ROUTES.signIn);
}

export async function forgotPasswordAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = readTrimmedField(formData, "email").toLowerCase();

  if (!email) {
    return {
      ...INITIAL_AUTH_ACTION_STATE,
      errorMessage: "Enter the email address for your account.",
    };
  }

  try {
    await requestPasswordReset({
      email,
      redirectTo: resolvePasswordResetRedirect(formData),
    });

    return {
      ...INITIAL_AUTH_ACTION_STATE,
      successMessage:
        "If an account exists for that email, we sent a password reset link. Check your inbox and spam folder.",
    };
  } catch (error) {
    return {
      ...INITIAL_AUTH_ACTION_STATE,
      errorMessage: formatPortalAuthError(error, "sign-in"),
    };
  }
}

export async function updatePasswordAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (password.length < 8) {
    return {
      ...INITIAL_AUTH_ACTION_STATE,
      errorMessage: "Password must be at least 8 characters.",
    };
  }

  if (password !== confirmPassword) {
    return {
      ...INITIAL_AUTH_ACTION_STATE,
      errorMessage: "Passwords do not match.",
    };
  }

  try {
    await updateCurrentUserPassword(password);
    return {
      ...INITIAL_AUTH_ACTION_STATE,
      successMessage: "Your password has been updated.",
    };
  } catch (error) {
    return {
      ...INITIAL_AUTH_ACTION_STATE,
      errorMessage: formatPortalAuthError(error, "sign-in"),
    };
  }
}

export async function redirectAuthorizedUserAction(role: UserRole, path: string) {
  if (canAccessRolePath(path, role)) {
    return;
  }

  redirect(getDashboardRouteForRole(role));
}
