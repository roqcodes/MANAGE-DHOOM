import { UserRole, type AuthMode } from "@/common/auth/types";

export const AUTH_ROUTES = {
  signIn: "/sign-in",
  signUp: "/sign-up",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  pendingApproval: "/pending-approval",
  admin: "/admin",
  vendor: "/vendor",
  delivery: "/delivery",
} as const;

export function getAuthRouteForMode(mode: AuthMode): string {
  return mode === "sign-in" ? AUTH_ROUTES.signIn : AUTH_ROUTES.signUp;
}

export function getAlternateAuthMode(mode: AuthMode): AuthMode {
  return mode === "sign-in" ? "request" : "sign-in";
}

export function getDashboardRouteForRole(role: UserRole): string {
  if (role === UserRole.Vendor) {
    return AUTH_ROUTES.vendor;
  }

  if (role === UserRole.Delivery) {
    return AUTH_ROUTES.delivery;
  }

  return AUTH_ROUTES.admin;
}
