import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  createStoreTransfer,
  listStoreTransfers,
} from "@/modules/erp/services/erp-store-transfers.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(request.url);
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  try {
    const result = await listStoreTransfers(page, 20, {
      fromStoreId: searchParams.get("fromStoreId") ?? undefined,
      toStoreId: searchParams.get("toStoreId") ?? undefined,
      search: searchParams.get("search") ?? undefined,
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Failed to list transfers" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const id = await createStoreTransfer(body);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to create transfer";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
