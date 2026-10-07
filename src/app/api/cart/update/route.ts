import { NextResponse } from "next/server";

import { updateCartItem, getCart } from "@/modules/cart/services/cart.service";

/**
 * POST /api/cart/update
 * Update cart item quantity. Set quantity to 0 to remove.
 * Body: { variantId: string, quantity: number }
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

    if (
      body.quantity === undefined ||
      typeof body.quantity !== "number"
    ) {
      return NextResponse.json(
        { error: "quantity is required and must be a number" },
        { status: 400 },
      );
    }

    const cartItem = await updateCartItem(body.variantId, body.quantity);

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
      item: cartItem,
      cart,
      itemCount,
      totalAmount,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized: User not authenticated") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message.includes("Invalid")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Error updating cart:", error);
    return NextResponse.json(
      { error: "Failed to update cart item" },
      { status: 500 },
    );
  }
}
