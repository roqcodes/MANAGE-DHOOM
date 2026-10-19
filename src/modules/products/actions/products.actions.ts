"use server";

import { safeRevalidateProductCatalog } from "@/lib/cache/safe-revalidate";

import {
  deleteProduct,
  insertProduct,
  setProductActive,
  setProductsActiveByIds,
  downgradeProductToFlatLayout,
  upgradeProductToGroupedLayout,
  updateProductById,
  updateProductSpecs,
} from "@/modules/products/services/products.service";
import { ensureDefaultProductVariant } from "@/modules/products/services/ensure-default-product-variant.service";
import {
  addProductImages,
  addProductVideos,
  syncProductImages,
  syncProductVideos,
} from "@/modules/products/services/product-media.service";

export async function createProductAction(data: {
  name: string;
  description: string;
  categoryId: string | null;
  brandId: string | null;
  imageUrl: string | null;
  variantLayout?: "flat" | "grouped";
  imageUrls?: string[];
  videoUrls?: string[];
  itemType?: "goods" | "service";
  hsnSac?: string | null;
  price?: number | null;
  mrp?: number | null;
  barcode?: string | null;
  purchasePrice?: number | null;
  taxRatePercent?: number | null;
}): Promise<string> {
  const id = await insertProduct({
    name: data.name,
    description: data.description || null,
    categoryId: data.categoryId || null,
    brandId: data.brandId || null,
    imageUrl: data.imageUrl,
    variantLayout: data.variantLayout,
    itemType: data.itemType,
    hsnSac: data.hsnSac,
    price: data.price,
    mrp: data.mrp,
    barcode: data.barcode,
    purchasePrice: data.purchasePrice,
    taxRatePercent: data.taxRatePercent,
  });
  if (data.imageUrls && data.imageUrls.length > 0) {
    await addProductImages(id, data.imageUrls);
  }
  if (data.videoUrls && data.videoUrls.length > 0) {
    await addProductVideos(id, data.videoUrls);
  }
  safeRevalidateProductCatalog(id);
  return id;
}

export async function updateProductAction(
  id: string,
  data: {
    name: string;
    description: string;
    categoryId: string | null;
    brandId: string | null;
    imageUrl: string | null;
    imageUrls?: string[];
    videoUrls?: string[];
    imagePreviewIndex?: number;
    itemType?: "goods" | "service";
    hsnSac?: string | null;
    price?: number | null;
    mrp?: number | null;
    barcode?: string | null;
    purchasePrice?: number | null;
    taxRatePercent?: number | null;
  },
): Promise<void> {
  await updateProductById(id, {
    name: data.name,
    description: data.description || null,
    categoryId: data.categoryId || null,
    brandId: data.brandId || null,
    imageUrl: data.imageUrl,
    itemType: data.itemType,
    hsnSac: data.hsnSac,
    price: data.price,
    mrp: data.mrp,
    barcode: data.barcode,
    purchasePrice: data.purchasePrice,
    taxRatePercent: data.taxRatePercent,
  });
  if (data.imageUrls !== undefined) {
    await syncProductImages(id, data.imageUrls, data.imagePreviewIndex ?? 0);
  }
  if (data.videoUrls !== undefined) {
    await syncProductVideos(id, data.videoUrls);
  }
  safeRevalidateProductCatalog(id);
}

export async function toggleProductAction(
  id: string,
  isActive: boolean,
): Promise<void> {
  await setProductActive(id, isActive);
  safeRevalidateProductCatalog(id);
}

export async function updateProductSpecsAction(
  id: string,
  specs: Record<string, string>,
): Promise<void> {
  await updateProductSpecs(id, specs);
  safeRevalidateProductCatalog(id);
}

export async function deleteProductAction(id: string): Promise<void> {
  await deleteProduct(id);
  safeRevalidateProductCatalog();
}

export async function bulkSetProductsActiveAction(
  ids: string[],
  isActive: boolean,
): Promise<void> {
  if (ids.length === 0) return;
  await setProductsActiveByIds(ids, isActive);
  for (const id of ids) {
    safeRevalidateProductCatalog(id);
  }
  safeRevalidateProductCatalog();
}

/** Create default online SKU for simple products (product-level price, no variants). */
export async function ensureDefaultProductVariantAction(
  productId: string,
): Promise<string> {
  const variantId = await ensureDefaultProductVariant(productId);
  safeRevalidateProductCatalog(productId);
  return variantId;
}

/** Upgrade flat/simple catalog to grouped layout; existing SKUs and stock are preserved. */
export async function upgradeProductToGroupedLayoutAction(
  productId: string,
  groupName?: string,
): Promise<void> {
  await upgradeProductToGroupedLayout(productId, groupName);
  safeRevalidateProductCatalog(productId);
}

/** Downgrade grouped catalog to flat variants; SKUs and stock are preserved. */
export async function downgradeProductToFlatLayoutAction(
  productId: string,
): Promise<void> {
  await downgradeProductToFlatLayout(productId);
  safeRevalidateProductCatalog(productId);
}

export async function bulkDeleteProductsAction(ids: string[]): Promise<void> {
  for (const id of ids) {
    await deleteProduct(id);
  }
  safeRevalidateProductCatalog();
}
