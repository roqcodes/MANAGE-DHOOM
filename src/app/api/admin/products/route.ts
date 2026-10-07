import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { getCategories } from "@/modules/products/services/categories.service";
import { getBrands } from "@/modules/products/services/brands.service";
import {
  getProductCatalogStats,
  getProducts,
} from "@/modules/products/services/products.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const categoryId = searchParams.get("category_id") || null;
  const storeId = searchParams.get("storeId") || null;

  const [{ data, total }, categories, brands, stats] = await Promise.all([
    getProducts(page, categoryId, storeId),
    getCategories(),
    getBrands(),
    getProductCatalogStats(),
  ]);

  return NextResponse.json({ data, total, categories, brands, page, stats });
}
