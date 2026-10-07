"use server";

import { revalidatePath } from "next/cache";

import {
  addVariantImages,
  deleteVariantImage,
  setPreviewImage,
} from "@/modules/products/services/variant-images.service";

export async function addVariantImagesAction(
  productId: string,
  variantId: string,
  urls: string[],
): Promise<void> {
  await addVariantImages(variantId, urls);
  revalidatePath(`/admin/products/${productId}`);
}

export async function deleteVariantImageAction(
  productId: string,
  imageId: string,
): Promise<void> {
  await deleteVariantImage(imageId);
  revalidatePath(`/admin/products/${productId}`);
}

export async function setPreviewImageAction(
  productId: string,
  variantId: string,
  imageId: string,
): Promise<void> {
  await setPreviewImage(variantId, imageId);
  revalidatePath(`/admin/products/${productId}`);
}
