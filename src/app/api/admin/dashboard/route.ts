import { NextResponse } from "next/server";

import type { DashboardChartGranularity } from "@/common/admin/types";
import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  getAdminDashboardPayload,
  type DashboardPayloadSection,
} from "@/modules/admin/services/dashboard.service";

function parseGranularity(value: string | null): DashboardChartGranularity {
  return value === "day" ? "day" : "month";
}

function parseSection(value: string | null): DashboardPayloadSection {
  if (value === "core" || value === "extended") return value;
  return "all";
}

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const storeId = params.get("storeId");
  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");
  const granularity = parseGranularity(params.get("granularity"));
  const section = parseSection(params.get("section"));
  const payload = await getAdminDashboardPayload(
    storeId,
    dateFrom,
    dateTo,
    granularity,
    section,
  );

  return NextResponse.json(payload);
}
