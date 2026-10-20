import { NextResponse } from "next/server";

import { requireAdminApiPageRead } from "@/lib/api/admin-api-auth";
import { recordAuthAudit } from "@/modules/auth/services/auth-audit.service";
import { createErpSalesman } from "@/modules/users/services/erp-salesmen.service";
import {
  createStaffPortalUserBySuperAdmin,
  getPortalUserPurgeEligibility,
  purgeInactivePortalUserBySuperAdmin,
} from "@/modules/users/services/portal-user-admin.service";
import {
  getTeamCatalogStats,
  getVerifiedPortalTeamUsers,
} from "@/modules/users/services/users.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiPageRead("/admin/users");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const purgeEligibilityUserId = searchParams.get("purgeEligibility");
  if (purgeEligibilityUserId) {
    if (!auth.profile.rbac?.canManageRoles) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    try {
      const eligibility = await getPortalUserPurgeEligibility(purgeEligibilityUserId);
      return NextResponse.json(eligibility);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Request failed.";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));

  const [stats, team] = await Promise.all([
    getTeamCatalogStats(),
    getVerifiedPortalTeamUsers(page),
  ]);

  return NextResponse.json({
    primary: "users" as const,
    page,
    stats,
    content: { kind: "team" as const, ...team },
  });
}

export async function POST(request: Request) {
  const auth = await requireAdminApiPageRead("/admin/users");
  if (!auth.ok) return auth.response;

  if (!auth.profile.rbac?.canManageRoles) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    action?: string;
    name?: string;
    email?: string;
    phone?: string;
    password?: string;
    roleId?: string;
    storeIds?: string[];
    defaultStoreId?: string | null;
    pin?: string;
  };

  if (body.action === "create_salesman") {
    try {
      const salesmanId = await createErpSalesman({
        name: body.name ?? "",
        pin: body.pin ?? "",
        email: body.email,
        phone: body.phone,
      });
      return NextResponse.json({ ok: true, salesmanId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Request failed.";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  if (body.action === "purge") {
    const userId = (body as { userId?: string }).userId;
    if (!userId) {
      return NextResponse.json({ error: "Missing user." }, { status: 400 });
    }
    try {
      await purgeInactivePortalUserBySuperAdmin(userId);
      await recordAuthAudit({
        action: "sign_in",
        userId: auth.profile.id,
        email: auth.profile.email ?? undefined,
        outcome: "success",
        reason: `purged inactive portal user ${userId}`,
      });
      return NextResponse.json({ ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Request failed.";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  if (body.action !== "create_staff") {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  if (!body.roleId) {
    return NextResponse.json({ error: "Role is required." }, { status: 400 });
  }

  try {
    const result = await createStaffPortalUserBySuperAdmin({
      name: body.name ?? "",
      email: body.email ?? "",
      password: body.password ?? "",
      phone: body.phone,
      roleId: body.roleId,
      storeIds: body.storeIds,
      defaultStoreId: body.defaultStoreId,
    });

    await recordAuthAudit({
      action: "sign_in",
      userId: auth.profile.id,
      email: auth.profile.email ?? undefined,
      outcome: "success",
      reason: `created staff user ${result.userId}`,
    });

    return NextResponse.json({ ok: true, userId: result.userId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Request failed.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
