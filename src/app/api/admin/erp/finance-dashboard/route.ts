import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  getFinancialDashboard,
  getReconciliationSnapshot,
} from "@/modules/erp/services/erp-finance-dashboard.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const view = new URL(request.url).searchParams.get("view");
  try {
    if (view === "reconciliation") {
      const snapshot = await getReconciliationSnapshot();
      return NextResponse.json(snapshot);
    }
    const dashboard = await getFinancialDashboard();
    return NextResponse.json(dashboard);
  } catch {
    return NextResponse.json({ error: "Failed to load financial data" }, { status: 500 });
  }
}
