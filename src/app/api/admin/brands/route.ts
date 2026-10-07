import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  createBrand,
  getBrands,
} from "@/modules/products/services/brands.service";

export async function GET() {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const brands = await getBrands();
  return NextResponse.json({ brands });
}

export async function POST(req: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const body = await req.json();

  try {
    const id = await createBrand({
      name: body.name,
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
