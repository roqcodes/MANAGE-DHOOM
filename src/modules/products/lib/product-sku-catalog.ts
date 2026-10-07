import type { ProductVariant, ProductWithCategory, VariantGroup } from "@/common/admin/types";

export const DEFAULT_SKU_LABELS = ["default", "default title"];

export type ProductCatalogMode =
  | "erp-only"
  | "simple"
  | "flat"
  | "grouped";

/** True when the variant name is the platform default SKU label (Shopify-style). */
export function isDefaultSkuName(
  name: string | null | undefined,
  productName?: string | null,
): boolean {
  const normalized = name?.trim().toLowerCase() ?? "";
  if (!normalized) return true;
  if (DEFAULT_SKU_LABELS.includes(normalized)) return true;
  const product = productName?.trim().toLowerCase();
  return Boolean(product && normalized === product);
}

export function getProductCatalogMode(
  product: Pick<ProductWithCategory, "variant_layout" | "price" | "name">,
  variants: ProductVariant[],
  variantGroups: VariantGroup[] = [],
): ProductCatalogMode {
  const grouped =
    product.variant_layout === "grouped" || variantGroups.length > 0;

  if (grouped) return "grouped";
  if (variants.length === 0) {
    return Number(product.price) > 0 ? "simple" : "erp-only";
  }
  if (variants.length === 1 && isDefaultSkuName(variants[0]?.name, product.name)) {
    return "simple";
  }
  return "flat";
}

export function catalogModeLabel(mode: ProductCatalogMode): string {
  switch (mode) {
    case "erp-only":
      return "ERP-only item";
    case "simple":
      return "Simple product";
    case "flat":
      return "Multi-SKU";
    case "grouped":
      return "Variant groups";
  }
}

export function catalogModeDescription(mode: ProductCatalogMode): string {
  switch (mode) {
    case "erp-only":
      return "No selling price or SKUs yet. Add a price for simple online sales, or add variants for multiple options.";
    case "simple":
      return "One default SKU (like Shopify simple products). Add more SKUs for sizes/models, or organize into variant groups for bulk storefront selection.";
    case "flat":
      return "Multiple SKUs with individual prices and images. Switch to variant groups for bulk add on the storefront.";
    case "grouped":
      return "SKUs are organized into groups (e.g. models). Customers pick quantities per group on the product page. Switch to flat variants for individual SKU images and picker UI.";
  }
}
