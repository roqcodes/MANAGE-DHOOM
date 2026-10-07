import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  allocateOnlineStockTransfer,
  cancelOnlineStockTransfer,
  createOnlineStockTransfer,
  createOnlineStockTransfersBulk,
  listOnlineStockTransfers,
} from "@/modules/inventory/services/online-stock-transfers.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const storeId = searchParams.get("storeId") ?? undefined;
  const status = searchParams.get("status") ?? undefined;

  const { data, total } = await listOnlineStockTransfers({
    storeId,
    status,
    page,
  });

  return NextResponse.json({ data, total, page });
}

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();

    if (Array.isArray(body.lines) && body.lines.length > 0) {
      const result = await createOnlineStockTransfersBulk({
        storeId: body.storeId,
        notes: body.notes ?? null,
        lines: body.lines.map((line: { productId: string; quantity: number }) => ({
          productId: line.productId,
          quantity: Number(line.quantity),
        })),
      });
      return NextResponse.json(result, { status: result.created.length > 0 ? 201 : 400 });
    }

    const transferId = await createOnlineStockTransfer({
      storeId: body.storeId,
      productId: body.productId,
      quantity: Number(body.quantity),
      notes: body.notes ?? null,
    });
    return NextResponse.json({ id: transferId }, { status: 201 });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Failed to create transfer";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const transferId = body.transferId as string;

    if (body.action === "allocate") {
      await allocateOnlineStockTransfer(transferId, body.allocations ?? []);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "cancel") {
      await cancelOnlineStockTransfer(transferId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Failed to update transfer";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
