import { NextResponse } from "next/server";

import { createOrderFromCart, checkCartAvailability } from "@/modules/orders/services/create-order.service";

/**
 * POST /api/orders/create
 * Create a new order from the current user's cart.
 * Body: { addressId: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.addressId || typeof body.addressId !== "string") {
      return NextResponse.json(
        { error: "Address ID is required" },
        { status: 400 },
      );
    }

    // First check availability
    const availability = await checkCartAvailability();
    if (!availability.available) {
      return NextResponse.json(
        {
          error: "Some items in your cart are not available",
          unavailableItems: availability.items.filter((i) => !i.available),
        },
        { status: 400 },
      );
    }

    const result = await createOrderFromCart({
      addressId: body.addressId,
    });

    return NextResponse.json({
      success: true,
      order: {
        id: result.orderId,
        orderNumber: result.orderNumber,
        totalAmount: result.totalAmount,
        itemCount: result.itemCount,
        items: result.items,
      },
      message: "Order placed successfully",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized: User not authenticated") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message === "Cart is empty") {
      return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
    }

    if (error instanceof Error && error.message.includes("Address not found")) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error("Error creating order:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create order" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/orders/create
 * Check cart availability before creating order.
 */
export async function GET() {
  try {
    const availability = await checkCartAvailability();

    return NextResponse.json({
      available: availability.available,
      items: availability.items,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized: User not authenticated") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("Error checking cart availability:", error);
    return NextResponse.json(
      { error: "Failed to check cart availability" },
      { status: 500 },
    );
  }
}
