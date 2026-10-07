"use server";

import { revalidatePath } from "next/cache";

import { revalidatePublicCatalog } from "@/lib/cache/public-catalog-cache";

import {
  createBrand,
  deleteBrand,
  updateBrand,
  type BrandInput,
} from "@/modules/products/services/brands.service";

export async function createBrandAction(input: BrandInput): Promise<string> {
  const id = await createBrand(input);
  revalidatePath("/admin/brands");
  revalidatePath("/admin/products");
  revalidatePublicCatalog();
  return id;
}

export async function updateBrandAction(
  id: string,
  input: Partial<BrandInput>,
): Promise<void> {
  await updateBrand(id, input);
  revalidatePath("/admin/brands");
  revalidatePath("/admin/products");
  revalidatePublicCatalog();
}

export async function deleteBrandAction(id: string): Promise<void> {
  await deleteBrand(id);
  revalidatePath("/admin/brands");
  revalidatePath("/admin/products");
  revalidatePublicCatalog();
}
