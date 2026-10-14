import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { runErpReport } from "@/modules/erp/services/erp-reports.service";
import type { ReportChannel } from "@/common/erp/report-types";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const slug = url.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  try {
    const data = await runErpReport({
      slug,
      dateFrom: url.searchParams.get("dateFrom") ?? undefined,
      dateTo: url.searchParams.get("dateTo") ?? undefined,
      asOf: url.searchParams.get("asOf") ?? undefined,
      storeId: url.searchParams.get("storeId") ?? undefined,
      channel: (url.searchParams.get("channel") as ReportChannel) ?? "all",
      accountId: url.searchParams.get("accountId") ?? undefined,
      brandId: url.searchParams.get("brandId") ?? undefined,
      categoryId: url.searchParams.get("categoryId") ?? undefined,
      stockLevel: (url.searchParams.get("stockLevel") as
        | "all"
        | "in_stock"
        | "out_of_stock"
        | "low_stock"
        | null) ?? undefined,
      fromStoreId: url.searchParams.get("fromStoreId") ?? undefined,
      toStoreId: url.searchParams.get("toStoreId") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      entityType: url.searchParams.get("entityType") ?? undefined,
      action: url.searchParams.get("action") ?? undefined,
      userId: url.searchParams.get("userId") ?? undefined,
      accountTypeId: url.searchParams.get("accountTypeId") ?? undefined,
    });
    return NextResponse.json({ data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to run report";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
