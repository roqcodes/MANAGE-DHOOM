import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  createCategory,
  getCategories,
} from "@/modules/products/services/categories.service";

export async function GET() {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const categories = await getCategories();
  return NextResponse.json({ categories });
}

export async function POST(req: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const body = await req.json();

  try {
    const id = await createCategory({
      name: body.name,
      parentId: body.parentId,
      imageUrl: body.imageUrl,
      sortOrder: body.sortOrder,
      isActive: body.isActive,
      slug: body.slug,
      description: body.description,
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Create failed" },
      { status: 400 },
    );
  }
}
