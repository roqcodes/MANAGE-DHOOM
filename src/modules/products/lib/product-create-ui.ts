import type { ProductCreateResult } from "@/modules/products/types/product-create-result";

export function productCreateAdminPath(productId: string): string {
  return `/admin/products?form=edit&product_id=${encodeURIComponent(productId)}`;
}

export function formatProductCreateOutcome(result: ProductCreateResult): string {
  return result.message;
}
