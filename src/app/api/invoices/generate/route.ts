import { NextResponse } from "next/server";

import { generateInvoice } from "@/modules/invoice/services/invoice.service";

/**
 * POST /api/invoices/generate
 * Generate invoice for an order.
 * Body: { orderId: string, gstNumber?: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const { orderId, gstNumber } = body;

    if (!orderId || typeof orderId !== "string") {
      return NextResponse.json(
        { error: "Order ID is required" },
        { status: 400 },
      );
    }

    const invoice = await generateInvoice(orderId, gstNumber);

    return NextResponse.json({
      invoice,
      message: "Invoice generated successfully",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized: User not authenticated") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message.includes("Order not found")) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof Error && error.message.includes("Invoice already exists")) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    console.error("Error generating invoice:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate invoice" },
      { status: 500 },
    );
  }
}
