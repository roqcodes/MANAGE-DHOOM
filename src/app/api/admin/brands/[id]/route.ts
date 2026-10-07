import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  deleteBrand,
  getBrandById,
  updateBrand,
} from "@/modules/products/services/brands.service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const brand = await getBrandById(id);
  if (!brand) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ brand });
}

export async function PATCH(req: Request, ctx: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const body = await req.json();

  try {
    await updateBrand(id, {
      name: body.name,
      imageUrl: body.imageUrl,
      sortOrder: body.sortOrder,
      isActive: body.isActive,
      slug: body.slug,
      description: body.description,
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
    await deleteBrand(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Delete failed" },
      { status: 400 },
    );
  }
}
