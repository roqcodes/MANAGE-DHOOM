import { NextResponse } from "next/server";

import { topUpWallet } from "@/modules/wallet/services/wallet.service";

/**
 * POST /api/payments/wallet-topup
 * Top up wallet balance.
 * Body: { amount: number, reference?: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const { amount, reference } = body;

    if (!amount || typeof amount !== "number" || amount <= 0) {
      return NextResponse.json(
        { error: "Amount must be a positive number" },
        { status: 400 },
      );
    }

    const newBalance = await topUpWallet({
      amount,
      reference: reference || "Wallet top-up",
    });

    return NextResponse.json({
      success: true,
      amount,
      newBalance,
      message: "Wallet topped up successfully",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized: User not authenticated") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("Error topping up wallet:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to top up wallet" },
      { status: 500 },
    );
  }
}
