import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { listItemUnits, createItemUnit } from "@/modules/items/services/item-units.service";

export async function GET() {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  try {
    const units = await listItemUnits();
    return NextResponse.json({ data: units });
  } catch (error) {
    console.error("[GET /api/admin/item-units]", error);
    return NextResponse.json({ error: "Failed to list item units" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const unit = await createItemUnit({
      name: body.name,
      abbreviation: body.abbreviation,
      sortOrder: body.sortOrder,
    });
    return NextResponse.json(unit, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to create item unit";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
