import { NextResponse } from "next/server";

import { getCustomerOrders, getCustomerOrderStats } from "@/modules/orders/services/customer-orders.service";

/**
 * GET /api/orders
 * Get current user's order history.
 * Query params: page (optional, default 0)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") ?? "0", 10);

    const [{ data, total, hasMore }, stats] = await Promise.all([
      getCustomerOrders(page),
      getCustomerOrderStats(),
    ]);

    return NextResponse.json({
      orders: data,
      total,
      page,
      hasMore,
      stats,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized: User not authenticated") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("Error fetching orders:", error);
    return NextResponse.json(
      { error: "Failed to fetch orders" },
      { status: 500 },
    );
  }
}
