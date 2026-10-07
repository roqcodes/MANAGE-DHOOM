import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { listItemTransactions } from "@/modules/erp/services/erp-item-transactions.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(request.url);
  try {
    const result = await listItemTransactions({
      storeId: searchParams.get("storeId") ?? undefined,
      type: searchParams.get("type") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      page: Math.max(0, parseInt(searchParams.get("page") ?? "0", 10)),
      limit: Math.min(100, parseInt(searchParams.get("limit") ?? "50", 10)),
    });
    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to list transactions";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
