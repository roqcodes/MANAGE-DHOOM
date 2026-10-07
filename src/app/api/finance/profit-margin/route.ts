import { NextResponse } from "next/server";

import { getProfitMarginReport } from "@/modules/finance/services/finance-reports.service";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;

    const reports = await getProfitMarginReport(startDate, endDate);

    const totals = reports.reduce(
      (acc, r) => ({
        revenue: acc.revenue + r.totalRevenue,
        cost: acc.cost + r.totalCost,
        margin: acc.margin + r.totalMargin,
        orders: acc.orders + r.ordersCount,
      }),
      { revenue: 0, cost: 0, margin: 0, orders: 0 },
    );

    const avgMarginPercent =
      totals.revenue > 0 ? (totals.margin / totals.revenue) * 100 : 0;

    return NextResponse.json({
      reports,
      totals: {
        totalRevenue: totals.revenue,
        totalCost: totals.cost,
        totalMargin: totals.margin,
        ordersCount: totals.orders,
        avgMarginPercent: Math.round(avgMarginPercent * 100) / 100,
      },
    });
  } catch (error) {
    console.error("Error fetching profit margin report:", error);

    if (error instanceof Error && error.message.includes("Admin access required")) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    return NextResponse.json(
      { error: "Failed to fetch profit margin report" },
      { status: 500 },
    );
  }
}
