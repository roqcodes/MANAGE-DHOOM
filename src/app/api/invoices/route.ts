import { NextResponse } from "next/server";

import { getInvoices } from "@/modules/invoice/services/invoice.service";

/**
 * GET /api/invoices
 * Get current user's invoice list.
 * Query params: page (optional, default 0)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") ?? "0", 10);

    const { invoices, total, hasMore } = await getInvoices(page);

    return NextResponse.json({
      invoices,
      total,
      page,
      hasMore,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized: User not authenticated") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("Error fetching invoices:", error);
    return NextResponse.json(
      { error: "Failed to fetch invoices" },
      { status: 500 },
    );
  }
}
