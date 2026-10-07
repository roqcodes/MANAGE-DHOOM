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
    });
    return NextResponse.json({ data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to run report";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
