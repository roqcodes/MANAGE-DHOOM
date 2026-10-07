"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import type {
  Brand,
  Category,
  ProductCatalogStats,
  ProductWithCategoryListItem,
} from "@/common/admin/types";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { ProductsPanel } from "@/modules/products/components/products-panel";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";

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

  if (isPending && !data) return <AdminPageSkeleton />;
  if (isError) {
    return (
      <div className="mx-auto w-full max-w-7xl px-3 py-6 sm:px-4">
        <div className="flex items-start gap-3 rounded-xl border border-rose-200/60 bg-rose-50/40 p-5">
          <AlertTriangle className="size-5 shrink-0 text-rose-600" />
          <div>
            <p className="text-sm font-semibold text-rose-900">
              Failed to load inventory items.
            </p>
            <p className="mt-1 text-sm text-rose-700">
              {error instanceof Error ? error.message : "Unknown error."}
            </p>
          </div>
        </div>
      </div>
    );
  }
  if (!data) return <AdminPageSkeleton />;

  return (
    <ProductsPanel
      products={data.data}
      categories={data.categories}
      brands={data.brands ?? []}
      total={data.total}
      page={data.page}
      stats={data.stats}
      storeId={storeId}
    />
  );
}
