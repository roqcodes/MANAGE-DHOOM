import { NextResponse } from "next/server";

import { payForOrder } from "@/modules/wallet/services/wallet.service";

/**
 * POST /api/payments/reconcile
 * Pay for an order using wallet balance.
 * Body: { orderId: string, amount: number }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const { orderId, amount } = body;

    if (!orderId || typeof orderId !== "string") {
      return NextResponse.json(
        { error: "Order ID is required" },
        { status: 400 },
      );
    }

    if (!amount || typeof amount !== "number" || amount <= 0) {
      return NextResponse.json(
        { error: "Amount must be a positive number" },
        { status: 400 },
      );
    }

    const result = await payForOrder(orderId, amount);

    return NextResponse.json({
      success: true,
      orderId,
      amount,
      remainingBalance: result.remainingBalance,
      transactionId: result.transactionId,
      message: "Payment successful",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized: User not authenticated") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message.includes("Order not found")) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof Error && error.message.includes("Insufficient wallet balance")) {
      return NextResponse.json({ error: error.message }, { status: 402 });
    }

    if (error instanceof Error && error.message.includes("Order already paid")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Error processing payment:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process payment" },
      { status: 500 },
    );
  }
}
