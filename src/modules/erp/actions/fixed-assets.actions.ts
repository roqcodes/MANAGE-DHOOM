"use server";

import { revalidatePath } from "next/cache";

import type { FixedAssetInput } from "@/modules/erp/services/erp-fixed-assets.service";
import {
  createFixedAsset,
  deleteFixedAsset,
  updateFixedAsset,
} from "@/modules/erp/services/erp-fixed-assets.service";

export async function createFixedAssetAction(input: FixedAssetInput): Promise<string> {
  const id = await createFixedAsset(input);
  revalidatePath("/admin/erp/fixed-assets");
  return id;
}

export async function updateFixedAssetAction(
  id: string,
  input: FixedAssetInput,
): Promise<void> {
  await updateFixedAsset(id, input);
  revalidatePath("/admin/erp/fixed-assets");
  revalidatePath(`/admin/erp/fixed-assets/${id}`);
}

export async function deleteFixedAssetAction(id: string): Promise<void> {
  await deleteFixedAsset(id);
  revalidatePath("/admin/erp/fixed-assets");
}
