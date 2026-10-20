"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";

import type {
  Brand,
  Category,
  ProductCatalogStats,
  ProductWithCategoryListItem,
} from "@/common/admin/types";
import { EMPTY_PRODUCT_CATALOG_STATS } from "@/modules/admin/lib/catalog-loading-defaults";
import { ProductsPanel } from "@/modules/products/components/products-panel";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import { AdminPageLoadError } from "@/modules/feedback/components/admin-page-load-error";

interface ProductsPayload {
  data: ProductWithCategoryListItem[];
  total: number;
  categories: Category[];
  brands: Brand[];
  page: number;
  stats: ProductCatalogStats;
}

export function AdminProductsView() {
  const searchParams = useSearchParams();
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const categoryId = searchParams.get("category_id") || null;
  const storeId = searchParams.get("storeId") || null;

  const { data, isPending, isError, error } = useQuery({
    queryKey: adminQueryKeys.products(page, categoryId, storeId),
    queryFn: () => {
      const q = new URLSearchParams();
      q.set("page", page.toString());
      if (categoryId) q.set("category_id", categoryId);
      if (storeId) q.set("storeId", storeId);
      return adminGet<ProductsPayload>(`products?${q.toString()}`);
    },
    placeholderData: keepPreviousData,
  });
  const initialLoading = isPending && !data;

  if (isError) {
    return <AdminPageLoadError title="Failed to load inventory items." error={error} />;
  }
  return (
    <ProductsPanel
      initialLoading={initialLoading}
      products={data?.data ?? []}
      categories={data?.categories ?? []}
      brands={data?.brands ?? []}
      total={data?.total ?? 0}
      page={data?.page ?? page}
      stats={data?.stats ?? EMPTY_PRODUCT_CATALOG_STATS}
      storeId={storeId}
    />
  );
}
