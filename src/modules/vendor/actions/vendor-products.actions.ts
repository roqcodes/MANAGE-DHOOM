"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  addVariantToMySupply,
  updateMyVendorProduct,
} from "@/modules/vendor/services/vendor-products.service";

const updateSchema = z.object({
  vendorProductId: z.string().uuid(),
  basePrice: z.number().positive("Price must be greater than 0.").optional(),
  stock: z.number().int().min(0, "Stock cannot be negative.").optional(),
});

export async function updateVendorCatalogItemAction(
  input: z.infer<typeof updateSchema>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors[0] ?? "Invalid input.";
    return { ok: false, message: msg };
  }

  try {
    await updateMyVendorProduct(parsed.data.vendorProductId, {
      basePrice: parsed.data.basePrice,
      stock: parsed.data.stock,
    });
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Update failed.",
    };
  }

  revalidatePath("/vendor/products");
  return { ok: true };
}

const addSchema = z.object({
  variantId: z.string().uuid(),
  basePrice: z.number().positive("Price must be greater than 0."),
  stock: z.number().int().min(0, "Stock cannot be negative."),
});

export async function addVariantToSupplyAction(
  input: z.infer<typeof addSchema>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors[0] ?? "Invalid input.";
    return { ok: false, message: msg };
  }

  try {
    await addVariantToMySupply(parsed.data.variantId, {
      basePrice: parsed.data.basePrice,
      stock: parsed.data.stock,
    });
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Could not add to supply.",
    };
  }

  revalidatePath("/vendor/products");
  return { ok: true };
}
