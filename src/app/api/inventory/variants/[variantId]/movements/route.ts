import { NextResponse } from "next/server";

import { getMovementsForVariant } from "@/modules/inventory/services/stock-movements.service";

/**
 * GET /api/inventory/variants/[variantId]/movements
 * Get stock movements for a specific variant.
 * Query params: page (optional, default 0)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ variantId: string }> },
) {
  try {
    const { variantId } = await params;
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") ?? "0", 10);

    const { movements, total, hasMore } = await getMovementsForVariant(
      variantId,
      page,
    );

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

    console.error("Error fetching variant movements:", error);
    return NextResponse.json(
      { error: "Failed to fetch variant movements" },
      { status: 500 },
    );
  }
}
