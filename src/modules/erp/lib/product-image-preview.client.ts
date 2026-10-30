"use client";

import { adminGet } from "@/modules/admin/lib/admin-api-client";

type ProductMediaResponse = {
  product?: { image_url?: string | null };
  product_images?: Array<{ url: string; sort_order?: number | null }>;
};

/** First gallery image, else product.image_url. */
export async function fetchProductPreviewImageUrl(productId: string): Promise<string | null> {
  const res = await adminGet<ProductMediaResponse>(`products/${productId}`);
  const images = [...(res.product_images ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
  const fromGallery = images.find((i) => i.url?.trim())?.url?.trim();
  const fromProduct = res.product?.image_url?.trim();
  return fromGallery || fromProduct || null;
}
