import { NextResponse } from "next/server";

import { removeFromCart, getCart } from "@/modules/cart/services/cart.service";

/**
 * POST /api/cart/remove
 * Remove item from cart.
 * Body: { variantId: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate request body
    if (!body.variantId || typeof body.variantId !== "string") {
      return NextResponse.json(
        { error: "variantId is required and must be a string" },
        { status: 400 },
      );
    }

    const removed = await removeFromCart(body.variantId);

    if (!removed) {
      return NextResponse.json(
        { error: "Item not found in cart", success: false },
        { status: 404 },
      );
    }

    // Fetch updated cart to return full state
    const cart = await getCart();

    const itemCount = cart?.items.reduce(
      (sum, item) => sum + item.quantity,
      0,
    ) ?? 0;

    const totalAmount = cart?.items.reduce((sum, item) => {
      const price = item.variant.price ?? 0;
      return sum + price * item.quantity;
    }, 0) ?? 0;

    return NextResponse.json({
      success: true,
      cart,
      itemCount,
      totalAmount,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized: User not authenticated") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("Error removing from cart:", error);
    return NextResponse.json(
      { error: "Failed to remove item from cart" },
      { status: 500 },
    );
  }
}
