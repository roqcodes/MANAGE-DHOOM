import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  getRbacRolePermissions,
  getUserStoreAccess,
  listRbacRoles,
} from "@/modules/rbac/services/rbac-admin.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  if (!auth.profile.rbac?.canManageRoles) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const roleId = searchParams.get("roleId");
  const userId = searchParams.get("userId");

  try {
    if (userId) {
      const storeIds = await getUserStoreAccess(userId);
      return NextResponse.json({ storeIds });
    }

    const roles = await listRbacRoles();
    if (!roleId) {
      return NextResponse.json({ roles });
    }
    const permissions = await getRbacRolePermissions(roleId);
    return NextResponse.json({ roles, permissions, roleId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not load roles.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
