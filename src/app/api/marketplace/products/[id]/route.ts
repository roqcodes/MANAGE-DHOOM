import { NextResponse } from "next/server";

import { PUBLIC_PRODUCT_DETAIL_CACHE_CONTROL } from "@/lib/http/public-cache-headers";
import { getMarketplaceProductById } from "@/modules/marketplace/services/marketplace-products.service";

/**
 * GET /api/marketplace/products/[id]
 * Get single product detail with variants.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const product = await getMarketplaceProductById(id);

    if (!product) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { product },
      { headers: { "Cache-Control": PUBLIC_PRODUCT_DETAIL_CACHE_CONTROL } },
    );
  } catch (error) {
    console.error("Error fetching product:", error);
    return NextResponse.json(
      { error: "Failed to fetch product" },
      { status: 500 },
    );
  }
}
