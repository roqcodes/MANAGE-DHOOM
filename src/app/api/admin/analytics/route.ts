import { NextRequest, NextResponse } from "next/server";
import { format, subDays } from "date-fns";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { getAnalyticsPayload } from "@/modules/analytics/services/analytics.service";

export async function GET(request: NextRequest) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const sp = request.nextUrl.searchParams;
  const today = new Date();
  const defaultTo = format(today, "yyyy-MM-dd");
  const defaultFrom = format(subDays(today, 29), "yyyy-MM-dd");

  const payload = await getAnalyticsPayload(
    {
      from: sp.get("from") ?? defaultFrom,
      to: sp.get("to") ?? defaultTo,
      category: sp.get("category"),
      tier: sp.get("tier"),
      region: sp.get("region"),
      productId: sp.get("product"),
    },
    {
      x: sp.get("x") ?? undefined,
      y: sp.get("y") ?? undefined,
    },
  );

  return NextResponse.json(payload);
}
