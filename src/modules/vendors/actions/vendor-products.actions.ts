"use server";

import { revalidatePath } from "next/cache";

import {
  deleteVendorProductById,
  insertVendorProduct,
  updateVendorProductById,
} from "@/modules/vendors/services/vendors.service";

export async function assignVariantToVendorAction(data: {
  vendorId: string;
  variantId: string;
  basePrice: number;
  stock: number;
}): Promise<void> {
  await insertVendorProduct({
    vendorId: data.vendorId,
    variantId: data.variantId,
    basePrice: data.basePrice,
    stock: data.stock,
  });
  revalidatePath(`/admin/vendors/${data.vendorId}`);
}

export async function updateVendorProductAction(
  id: string,
  vendorId: string,
  data: { basePrice: number; stock: number },
): Promise<void> {
  await updateVendorProductById(id, {
    basePrice: data.basePrice,
    stock: data.stock,
  });
  revalidatePath(`/admin/vendors/${vendorId}`);
}

export async function removeVendorProductAction(
  id: string,
  vendorId: string,
): Promise<void> {
  await deleteVendorProductById(id);
  revalidatePath(`/admin/vendors/${vendorId}`);
}
