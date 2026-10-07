import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  createOnlineToPhysicalTransfer,
  listOnlineToPhysicalTransfers,
} from "@/modules/inventory/services/online-to-physical-transfers.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const storeId = searchParams.get("storeId") ?? undefined;

  const { data, total } = await listOnlineToPhysicalTransfers({
    storeId,
    page,
  });

  return NextResponse.json({ data, total, page });
}

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const lines = Array.isArray(body.lines) ? body.lines : [];
    const transferId = await createOnlineToPhysicalTransfer({
      storeId: body.storeId,
      notes: body.notes ?? null,
      lines: lines.map((line: { variantId: string; quantity: number }) => ({
        variantId: line.variantId,
        quantity: Number(line.quantity),
      })),
    });
    return NextResponse.json({ id: transferId }, { status: 201 });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Failed to create transfer";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
