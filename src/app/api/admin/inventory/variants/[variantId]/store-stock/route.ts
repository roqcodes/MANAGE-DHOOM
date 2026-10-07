import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  listStoreInventoryForVariant,
  upsertStoreInventoryRow,
} from "@/modules/items/services/store-inventory.service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ variantId: string }> },
) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { variantId } = await params;
  try {
    const rows = await listStoreInventoryForVariant(variantId);
    return NextResponse.json({ data: rows });
  } catch (error) {
    console.error("[GET store-inventory]", error);
    return NextResponse.json({ error: "Failed to load store inventory" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ variantId: string }> },
) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { variantId } = await params;
  try {
    const body = await request.json();
    await upsertStoreInventoryRow({
      storeId: body.storeId,
      variantId,
      stock: body.stock,
      purchasePrice: body.purchasePrice,
      salesPrice: body.salesPrice,
      openingStock: body.openingStock,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to update store inventory";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
