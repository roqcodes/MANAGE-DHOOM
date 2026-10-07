import { NextResponse } from "next/server";

import { addToCart, getCart } from "@/modules/cart/services/cart.service";

/**
 * POST /api/cart/add
 * Add item to cart or increase quantity.
 * Body: { variantId: string, quantity?: number }
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

    const quantity =
      typeof body.quantity === "number" ? body.quantity : 1;

    if (quantity <= 0 || quantity > 10000) {
      return NextResponse.json(
        { error: "Quantity must be between 1 and 10000" },
        { status: 400 },
      );
    }

    const cartItem = await addToCart(body.variantId, quantity);

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

    console.error("Error adding to cart:", error);
    return NextResponse.json(
      { error: "Failed to add item to cart" },
      { status: 500 },
    );
  }
}
