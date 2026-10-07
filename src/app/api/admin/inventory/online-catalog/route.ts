import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { listOnlineVariantsForTransfer } from "@/modules/inventory/services/inventory.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get("storeId") ?? undefined;
  const q = searchParams.get("q") ?? "";
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const stockFilter = (searchParams.get("stockFilter") ??
    "in_stock") as "all" | "in_stock" | "out_of_stock";
  const sort = (searchParams.get("sort") ?? "stock_desc") as
    | "name"
    | "stock_desc"
    | "stock_asc";
  const limit = Math.min(
    Math.max(parseInt(searchParams.get("limit") ?? "50", 10), 1),
    100,
  );

  try {
    const { data, total } = await listOnlineVariantsForTransfer({
      storeId,
      query: q,
      stockFilter,
      sort,
      page,
      limit,
    });
    return NextResponse.json({ data, total, page });
  } catch (error) {
    console.error("[GET /api/admin/inventory/online-catalog]", error);
    return NextResponse.json({ error: "Catalog load failed" }, { status: 500 });
  }
}
