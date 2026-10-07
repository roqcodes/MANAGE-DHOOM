import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { isProtectedRolePath } from "@/modules/auth/access.control";
import { AUTH_ROUTES } from "@/modules/auth/services/auth-route.service";
import { createSupabaseMiddlewareClient } from "@/lib/integrations/supabase/middleware";

/**
 * Session refresh + coarse auth only. Role, verification, and route ACL are
 * enforced in layouts / guards so we do not duplicate a `users` row fetch here
 * on every navigation (that doubled Supabase latency with the RSC tree).
 */
export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request,
  });

  const supabase = createSupabaseMiddlewareClient(request, response);
  const pathname = request.nextUrl.pathname;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const requiresSession =
    isProtectedRolePath(pathname) || pathname === AUTH_ROUTES.pendingApproval;

  if (!user) {
    if (requiresSession) {
      return NextResponse.redirect(new URL(AUTH_ROUTES.signIn, request.url));
    }

    return response;
  }

  // Do not redirect signed-in users away from sign-in / sign-up here. That caused
  // an auth storm when a session existed without a public.users row (failed staff
  // sign-up): middleware sent them to "/", and "/" sent them back to sign-in.
  // Server pages use redirectAuthenticatedUsersFromAuth() once a profile exists.

  // Recovery sessions land on reset-password; keep users there until they finish.
  if (
    pathname === AUTH_ROUTES.forgotPassword ||
    pathname === AUTH_ROUTES.resetPassword
  ) {
    return response;
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|_next/webpack-hmr|sw\\.js|manifest\\.webmanifest|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
