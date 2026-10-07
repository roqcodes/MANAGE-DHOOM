import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  deleteItemUnit,
  getItemUnitById,
  updateItemUnit,
} from "@/modules/items/services/item-units.service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  try {
    const unit = await getItemUnitById(id);
    if (!unit) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ unit });
  } catch (error) {
    console.error("[GET /api/admin/item-units/:id]", error);
    return NextResponse.json({ error: "Failed to load item unit" }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const body = await req.json();

  try {
    await updateItemUnit(id, {
      name: body.name,
      abbreviation: body.abbreviation,
      is_active: body.isActive,
      sort_order: body.sortOrder,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Update failed" },
      { status: 400 },
    );
  }
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;

  try {
    await deleteItemUnit(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Delete failed" },
      { status: 400 },
    );
  }
}
