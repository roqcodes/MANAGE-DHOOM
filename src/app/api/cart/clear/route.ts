import { NextResponse } from "next/server";

import { clearCart } from "@/modules/cart/services/cart.service";

/**
 * POST /api/cart/clear
 * Clear entire cart.
 */
export async function POST() {
  try {
    const cleared = await clearCart();

    if (!cleared) {
      return NextResponse.json(
        { error: "Cart not found", success: false },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Cart cleared",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized: User not authenticated") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("Error clearing cart:", error);
    return NextResponse.json(
      { error: "Failed to clear cart" },
      { status: 500 },
    );
  }
}
