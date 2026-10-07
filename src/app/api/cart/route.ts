import { NextResponse } from "next/server";

import { getCart } from "@/modules/cart/services/cart.service";

/**
 * GET /api/cart
 * Get current user's cart with items and product details.
 */
export async function GET() {
  try {
    const cart = await getCart();

    if (!cart) {
      return NextResponse.json({
        cart: null,
        itemCount: 0,
        totalAmount: 0,
      });
    }

    const itemCount = cart.items.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );

    const totalAmount = cart.items.reduce((sum, item) => {
      const price = item.variant.price ?? 0;
      return sum + price * item.quantity;
    }, 0);

    return NextResponse.json({
      cart,
      itemCount,
      totalAmount,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized: User not authenticated") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("Error fetching cart:", error);
    return NextResponse.json(
      { error: "Failed to fetch cart" },
      { status: 500 },
    );
  }
}
