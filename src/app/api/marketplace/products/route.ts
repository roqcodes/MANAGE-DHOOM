import { NextResponse } from "next/server";

import { PUBLIC_CATALOG_LIST_CACHE_CONTROL } from "@/lib/http/public-cache-headers";
import {
  getMarketplaceProducts,
  getMarketplaceCategories,
} from "@/modules/marketplace/services/marketplace-products.service";

/**
 * GET /api/marketplace/products
 * Get public product catalog (active products only).
 * Query params: page (optional, default 0)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") ?? "0", 10);

    const [{ data, total, hasMore }, categories] = await Promise.all([
      getMarketplaceProducts(page),
      getMarketplaceCategories(),
    ]);

    return NextResponse.json(
      {
        products: data,
        total,
        page,
        hasMore,
        categories,
      },
      { headers: { "Cache-Control": PUBLIC_CATALOG_LIST_CACHE_CONTROL } },
    );
  } catch (error) {
    console.error("Error fetching marketplace products:", error);
    return NextResponse.json(
      { error: "Failed to fetch products" },
      { status: 500 },
    );
  }
}
