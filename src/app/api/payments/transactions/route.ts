import { NextResponse } from "next/server";

import { getTransactions } from "@/modules/wallet/services/wallet.service";

/**
 * GET /api/payments/transactions
 * Get current user's transaction history.
 * Query params: page (optional, default 0)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") ?? "0", 10);

    const { transactions, total, hasMore } = await getTransactions(page);

    return NextResponse.json({
      transactions,
      total,
      page,
      hasMore,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized: User not authenticated") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("Error fetching transactions:", error);
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 },
    );
  }
}
