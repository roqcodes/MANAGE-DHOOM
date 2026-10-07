"use server";

import { revalidatePath } from "next/cache";

import {
  updateInventoryReorderSettings,
  upsertInventoryStock,
} from "@/modules/inventory/services/inventory.service";

export async function overrideStockAction(
  variantId: string,
  stock: number,
): Promise<void> {
  await upsertInventoryStock(variantId, stock);
  revalidatePath("/admin/inventory");
}

export async function updateReorderPointAction(
  variantId: string,
  reorder_point: number,
): Promise<void> {
  await updateInventoryReorderSettings(variantId, reorder_point);
  revalidatePath("/admin/inventory");
}
