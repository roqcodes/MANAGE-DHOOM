import { NextResponse } from "next/server";

import { requireVendorApiProfile } from "@/lib/api/vendor-api-auth";
import {
  getVendorDashboardStats,
  getVendorRecentPurchaseOrders,
} from "@/modules/vendor/services/vendor-dashboard.service";

export async function GET() {
  const auth = await requireVendorApiProfile();
  if (!auth.ok) return auth.response;

  try {
    const [stats, recent] = await Promise.all([
      getVendorDashboardStats(),
      getVendorRecentPurchaseOrders(8),
    ]);

    return NextResponse.json({
      stats,
      recent,
    });
  } catch (error) {
    console.error("Error fetching vendor dashboard:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 },
    );
  }
}
