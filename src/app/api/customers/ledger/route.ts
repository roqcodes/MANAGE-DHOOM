import { NextResponse } from "next/server";

import { getMyLedger } from "@/modules/credit/services/credit-limits.service";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") ?? "0", 10);
    const limit = parseInt(searchParams.get("limit") ?? "20", 10);

    const { entries, total } = await getMyLedger(page, limit);

    return NextResponse.json({
      entries,
      total,
      page,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized: User not authenticated") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("Error fetching ledger:", error);
    return NextResponse.json(
      { error: "Failed to fetch ledger" },
      { status: 500 },
    );
  }
}
