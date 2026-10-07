import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  createLandedCostItem,
  listLandedCostItems,
  updateLandedCostItem,
} from "@/modules/erp/services/erp-landed-costs.service";

export async function GET() {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  try {
    const data = await listLandedCostItems();
    return NextResponse.json({ data });
  } catch (error) {
    console.error("[GET /api/admin/erp/landed-costs]", error);
    return NextResponse.json({ error: "Failed to list landed cost items" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const id = await createLandedCostItem(body);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to create landed cost item";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    await updateLandedCostItem(body.id, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to update landed cost item";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
