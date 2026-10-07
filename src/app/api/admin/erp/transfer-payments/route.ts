import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  createBulkTransferPayment,
  listPendingTransferPayments,
  listTransferPayments,
} from "@/modules/erp/services/erp-transfer-payments.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view");

  try {
    if (view === "pending") {
      const data = await listPendingTransferPayments({
        fromStoreId: searchParams.get("fromStoreId") ?? undefined,
        toStoreId: searchParams.get("toStoreId") ?? undefined,
      });
      return NextResponse.json({ data });
    }

    const result = await listTransferPayments({
      page: Math.max(0, parseInt(searchParams.get("page") ?? "0", 10)),
      fromStoreId: searchParams.get("fromStoreId") ?? undefined,
      toStoreId: searchParams.get("toStoreId") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      search: searchParams.get("search") ?? undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to list payments";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const result = await createBulkTransferPayment(body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to record payment";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
