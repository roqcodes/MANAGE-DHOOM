"use server";

import { revalidatePath } from "next/cache";

import {
  createItemUnit,
  deleteItemUnit,
  updateItemUnit,
} from "@/modules/items/services/item-units.service";

export type ItemUnitInput = {
  name: string;
  abbreviation: string;
  sortOrder?: number;
  isActive?: boolean;
};

export async function createItemUnitAction(input: ItemUnitInput): Promise<string> {
  const unit = await createItemUnit({
    name: input.name,
    abbreviation: input.abbreviation,
    sortOrder: input.sortOrder,
    isActive: input.isActive,
  });
  revalidatePath("/admin/item-units");
  revalidatePath("/admin/products");
  return unit.id;
}

export async function updateItemUnitAction(
  id: string,
  input: Partial<ItemUnitInput>,
): Promise<void> {
  await updateItemUnit(id, {
    name: input.name,
    abbreviation: input.abbreviation,
    is_active: input.isActive,
    sort_order: input.sortOrder,
  });
  revalidatePath("/admin/item-units");
  revalidatePath("/admin/products");
}

export async function deleteItemUnitAction(id: string): Promise<void> {
  await deleteItemUnit(id);
  revalidatePath("/admin/item-units");
  revalidatePath("/admin/products");
}
