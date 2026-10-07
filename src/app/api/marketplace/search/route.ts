import { NextResponse } from "next/server";

import { NO_STORE_CACHE_CONTROL } from "@/lib/http/public-cache-headers";
import { searchMarketplaceProducts } from "@/modules/marketplace/services/marketplace-products.service";

/**
 * GET /api/marketplace/search
 * Search products by name or description.
 * Query params: q (search query), page (optional, default 0)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");
    const page = parseInt(searchParams.get("page") ?? "0", 10);

    if (!query || !query.trim()) {
      return NextResponse.json(
        { error: "Search query is required" },
        { status: 400 },
      );
    }

    const { data, total, hasMore } = await searchMarketplaceProducts(
      query.trim(),
      page,
    );

    return NextResponse.json(
      {
        products: data,
        total,
        page,
        hasMore,
        query: query.trim(),
      },
      { headers: { "Cache-Control": NO_STORE_CACHE_CONTROL } },
    );
  } catch (error) {
    console.error("Error searching products:", error);
    return NextResponse.json(
      { error: "Failed to search products" },
      { status: 500 },
    );
  }
}
