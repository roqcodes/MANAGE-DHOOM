import { NextResponse } from "next/server";

import {
  getFinanceSummary,
  getTransactionSummary,
} from "@/modules/finance/services/finance-reports.service";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") ?? "30", 10);

    const [summary, txSummary] = await Promise.all([
      getFinanceSummary(),
      getTransactionSummary(days),
    ]);

    return NextResponse.json({
      summary,
      transactions: txSummary,
      period: `${days} days`,
    });
  } catch (error) {
    console.error("Error fetching finance summary:", error);

    if (error instanceof Error && error.message.includes("Admin access required")) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    return NextResponse.json(
      { error: "Failed to fetch finance summary" },
      { status: 500 },
    );
  }
}
