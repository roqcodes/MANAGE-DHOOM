import { NextResponse } from "next/server";

import { getMarketplaceProductsByCategory } from "@/modules/marketplace/services/marketplace-products.service";

/**
 * GET /api/marketplace/categories/[id]/products
 * Get products by category.
 * Query params: page (optional, default 0)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") ?? "0", 10);

    const { data, total, hasMore } = await getMarketplaceProductsByCategory(
      id,
      page,
    );

    return NextResponse.json({
      products: data,
      total,
      page,
      hasMore,
      categoryId: id,
    });
  } catch (error) {
    console.error("Error fetching category products:", error);
    return NextResponse.json(
      { error: "Failed to fetch category products" },
      { status: 500 },
    );
  }
}
