import { NextResponse } from "next/server";

import { getReceivables } from "@/modules/finance/services/finance-reports.service";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;

    const receivables = await getReceivables(status);

    const totalOutstanding = receivables.reduce(
      (sum, r) => sum + r.outstanding_amount,
      0,
    );

    return NextResponse.json({
      receivables,
      totalOutstanding,
      count: receivables.length,
    });
  } catch (error) {
    console.error("Error fetching receivables:", error);

    if (error instanceof Error && error.message.includes("Admin access required")) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    return NextResponse.json(
      { error: "Failed to fetch receivables" },
      { status: 500 },
    );
  }
}
