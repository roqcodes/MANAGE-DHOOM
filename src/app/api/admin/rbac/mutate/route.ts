import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  assignUserRbac,
  deleteCustomRbacRole,
  setRbacPermission,
  upsertCustomRbacRole,
} from "@/modules/rbac/services/rbac-admin.service";

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  if (!auth.profile.rbac?.canManageRoles) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    action?: string;
    name?: string;
    description?: string;
    roleId?: string;
    permissionKey?: string;
    canRead?: boolean;
    canWrite?: boolean;
    storeId?: string | null;
    userId?: string;
    storeIds?: string[];
    defaultStoreId?: string | null;
  };

  try {
    switch (body.action) {
      case "upsert_role": {
        const id = await upsertCustomRbacRole({
          name: body.name ?? "",
          description: body.description,
          roleId: body.roleId,
        });
        return NextResponse.json({ roleId: id });
      }
      case "set_permission": {
        if (!body.roleId || !body.permissionKey) {
          return NextResponse.json({ error: "Missing fields." }, { status: 400 });
        }
        await setRbacPermission({
          roleId: body.roleId,
          permissionKey: body.permissionKey,
          canRead: Boolean(body.canRead),
          canWrite: Boolean(body.canWrite),
          storeId: body.storeId,
        });
        return NextResponse.json({ ok: true });
      }
      case "delete_role": {
        if (!body.roleId) {
          return NextResponse.json({ error: "Missing role." }, { status: 400 });
        }
        await deleteCustomRbacRole(body.roleId);
        return NextResponse.json({ ok: true });
      }
      case "assign_user": {
        if (!body.userId || !body.roleId) {
          return NextResponse.json({ error: "Missing user or role." }, { status: 400 });
        }
        await assignUserRbac({
          userId: body.userId,
          roleId: body.roleId,
          storeIds: body.storeIds,
          defaultStoreId: body.defaultStoreId,
        });
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Request failed.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
