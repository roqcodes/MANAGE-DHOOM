import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { resolveAuthAvatarUrl } from "@/modules/auth/lib/resolve-auth-avatar-url";
import { getAdminErpShell } from "@/modules/erp/services/store-context.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const includeContext = new URL(request.url).searchParams.get("includeContext") !== "0";
  const profile = {
    ...auth.profile,
    avatar_url: resolveAuthAvatarUrl(auth.user),
  };

  if (!includeContext) {
    return NextResponse.json({ profile });
  }

  try {
    const { context, stores } = await getAdminErpShell();
    return NextResponse.json({ profile, context, stores });
  } catch (error) {
    console.error("[GET /api/admin/bootstrap]", error);
    return NextResponse.json({ error: "Failed to load admin bootstrap" }, { status: 500 });
  }
}
