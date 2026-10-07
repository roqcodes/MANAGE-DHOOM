import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { createTransferRequest, listTransferRequests } from "@/modules/erp/services/erp-transfer-requests.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(request.url);
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  try {
    const result = await listTransferRequests(page, 20, {
      fromStoreId: searchParams.get("fromStoreId") ?? undefined,
      toStoreId: searchParams.get("toStoreId") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      status: searchParams.get("status") ?? undefined,
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Failed to list requests" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const id = await createTransferRequest(body);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to create request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
