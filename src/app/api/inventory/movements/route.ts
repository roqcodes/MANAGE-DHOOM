import { NextResponse } from "next/server";

import { getAllMovements } from "@/modules/inventory/services/stock-movements.service";
import type { StockMovementType } from "@/modules/inventory/services/stock-movements.service";

/**
 * GET /api/inventory/movements
 * Get all stock movements (admin view).
 * Query params: page (optional), type (optional filter)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") ?? "0", 10);
    const type = searchParams.get("type") as StockMovementType | null;

    const { movements, total, hasMore } = await getAllMovements(page, type || undefined);

    return NextResponse.json({
      movements,
      total,
      page,
      hasMore,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized: User not authenticated") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message.includes("Admin access required")) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    console.error("Error fetching movements:", error);
    return NextResponse.json(
      { error: "Failed to fetch stock movements" },
      { status: 500 },
    );
  }
}
