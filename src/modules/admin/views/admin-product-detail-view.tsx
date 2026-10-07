"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useParams } from "next/navigation";

import type {
  Brand,
  Category,
  ProductAtGlanceMetrics,
  ProductVariant,
  ProductWithCategory,
  VariantGroup,
} from "@/common/admin/types";
import type { PricingRuleRow } from "@/modules/pricing/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AdminBreadcrumb } from "@/modules/admin/components/admin-breadcrumb";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { ProductDetailPanel } from "@/modules/products/components/product-detail-panel";
import { adminGetNullable } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";

type ProductDetailPayload = {
  product: ProductWithCategory;
  variants: ProductVariant[];
  variant_groups?: VariantGroup[];
  categories: Category[];
  brands: Brand[];
  pricingRule: PricingRuleRow | null;
  glance: ProductAtGlanceMetrics;
};

function ProductDetailNav({ productName }: { productName?: string | null }) {
  return (
    <AdminBreadcrumb
      backHref="/admin/products"
      items={[
        { label: "Inventory Items", href: "/admin/products" },
        { label: productName?.trim() || "Item" },
      ]}
    />
  );
}

export function AdminProductDetailView() {
  const params = useParams();
  const slug = (params.slug as string[] | undefined) ?? [];
  const id =
    slug[0] === "products" && typeof slug[1] === "string" ? slug[1] : "";

  const { data, isPending, isError, error } = useQuery({
    queryKey: adminQueryKeys.productDetail(id),
    queryFn: () => adminGetNullable<ProductDetailPayload>(`products/${id}`),
    enabled: Boolean(id),
    placeholderData: keepPreviousData,
  });

  if (!id) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-3 py-2.5 sm:px-4">
        <p className="text-sm text-muted-foreground">Missing product id.</p>
      </div>
    );
  }

  if (isPending && data === undefined) return <AdminPageSkeleton />;
  if (isError) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-3 py-2.5 sm:px-4">
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Failed to load product</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : "Unknown error."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  if (data === null) {
    return (
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-3 px-3 py-2.5 sm:px-4">
        <ProductDetailNav />
        <p className="text-sm text-muted-foreground">This product could not be found.</p>
      </div>
    );
  }

  const { product, variants, variant_groups, categories, brands, pricingRule, glance } = data;

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-3 px-3 py-2.5 font-sans sm:px-4">
      <ProductDetailNav productName={product.name} />

      <ProductDetailPanel
        product={product}
        variants={variants}
        variantGroups={variant_groups ?? []}
        categories={categories}
        brands={brands ?? []}
        pricingRule={pricingRule}
        glance={glance}
      />
    </div>
  );
}
