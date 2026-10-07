import { NextResponse } from "next/server";

import { getInvoiceByOrderId } from "@/modules/invoice/services/invoice.service";

/**
 * GET /api/invoices/order/[orderId]
 * Get invoice by order ID.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    const { orderId } = await params;

    const invoice = await getInvoiceByOrderId(orderId);

    if (!invoice) {
      return NextResponse.json(
        { error: "Invoice not found for this order" },
        { status: 404 },
      );
    }

    return NextResponse.json({ invoice });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized: User not authenticated") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("Error fetching invoice by order:", error);
    return NextResponse.json(
      { error: "Failed to fetch invoice" },
      { status: 500 },
    );
  }
}
