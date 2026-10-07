import { NextResponse } from "next/server";

import { getWalletBalance, getWallet } from "@/modules/wallet/services/wallet.service";

/**
 * GET /api/payments/wallet-balance
 * Get current user's wallet balance.
 */
export async function GET() {
  try {
    const [balance, wallet] = await Promise.all([
      getWalletBalance(),
      getWallet(),
    ]);

    return NextResponse.json({
      balance,
      wallet,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized: User not authenticated") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("Error fetching wallet balance:", error);
    return NextResponse.json(
      { error: "Failed to fetch wallet balance" },
      { status: 500 },
    );
  }
}
