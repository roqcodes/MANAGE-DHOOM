"use server";

import { revalidatePath } from "next/cache";

import { revalidatePublicCatalog } from "@/lib/cache/public-catalog-cache";

import {
  deleteVariantAndSupplyRows,
  insertVariantWithInventory,
  updateVariantById,
} from "@/modules/products/services/product-variants.service";
import { addVariantImages } from "@/modules/products/services/variant-images.service";

function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100;
}

import { insertVariantGroup } from "@/modules/products/services/variant-groups.service";
import { updateVariantGroupById } from "@/modules/products/services/variant-groups.service";
export async function updateVariantGroupAction(
  groupId: string,
  productId: string,
  data: { name: string },
): Promise<void> {
  await updateVariantGroupById(groupId, { name: data.name });
  revalidatePath(`/admin/products/${productId}`);
  revalidatePublicCatalog();
}

export type GroupedVariantSaveRow = {
  localId: string;
  variantId?: string;
  name: string;
  price: number;
  mrp: number;
  stock: number;
};

export type GroupedVariantSaveGroup = {
  localId: string;
  name: string;
  rows: GroupedVariantSaveRow[];
};

export async function saveGroupedVariantsAction(
  productId: string,
  groups: GroupedVariantSaveGroup[],
  originalVariantIds: string[],
  originalGroupIds: string[],
): Promise<void> {
  const originalVariantSet = new Set(originalVariantIds);
  const originalGroupSet = new Set(originalGroupIds);
  const keptVariantIds = new Set<string>();

  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    let groupId = g.localId;
    if (!originalGroupSet.has(g.localId)) {
      groupId = await insertVariantGroup({
        productId,
        name: g.name,
        sortOrder: gi,
      });
    } else {
      await updateVariantGroupById(groupId, { name: g.name });
    }

    for (const row of g.rows) {
      const name = row.name.trim();
      if (!name) continue;
      const price = roundMoney2(row.price);
      const mrp = roundMoney2(row.mrp);

      if (row.variantId && originalVariantSet.has(row.variantId)) {
        await updateVariantById(row.variantId, { name, price, mrp });
        keptVariantIds.add(row.variantId);
      } else {
        const variantId = await insertVariantWithInventory({
          productId,
          name,
          price,
          mrp,
          variantGroupId: groupId,
        });
        keptVariantIds.add(variantId);
      }
    }
  }

  for (const id of originalVariantIds) {
    if (!keptVariantIds.has(id)) {
      await deleteVariantAndSupplyRows(id);
    }
  }

  revalidatePath(`/admin/products/${productId}`);
  revalidatePublicCatalog();
  revalidatePath("/admin/products");
  revalidatePublicCatalog();
}

export async function createVariantGroupAction(
  productId: string,
  data: { name: string; sortOrder?: number },
): Promise<string> {
  const groupId = await insertVariantGroup({
    productId,
    name: data.name,
    sortOrder: data.sortOrder,
  });
  revalidatePath(`/admin/products/${productId}`);
  revalidatePublicCatalog();
  return groupId;
}

export async function createVariantAction(
  productId: string,
  data: {
    name: string;
    price: number;
    mrp: number;
    stock?: number;
    variantGroupId?: string | null;
    imageUrls?: string[];
    barcode?: string | null;
    productCode?: string | null;
    purchasePrice?: number | null;
    taxRatePercent?: number | null;
    unitId?: string | null;
    markupPercent?: number | null;
  },
): Promise<string> {
  const variantId = await insertVariantWithInventory({
    productId,
    name: data.name,
    price: roundMoney2(data.price),
    mrp: roundMoney2(data.mrp),
    stock: data.stock,
    variantGroupId: data.variantGroupId,
    barcode: data.barcode,
    productCode: data.productCode,
    purchasePrice: data.purchasePrice,
    taxRatePercent: data.taxRatePercent,
    unitId: data.unitId,
    markupPercent: data.markupPercent,
  });
  if (data.imageUrls && data.imageUrls.length > 0) {
    await addVariantImages(variantId, data.imageUrls);
  }
  revalidatePath(`/admin/products/${productId}`);
  revalidatePublicCatalog();
  return variantId;
}

export async function updateVariantAction(
  id: string,
  productId: string,
  data: {
    name: string;
    price: number;
    mrp: number;
    barcode?: string | null;
    productCode?: string | null;
    purchasePrice?: number | null;
    taxRatePercent?: number | null;
    unitId?: string | null;
    markupPercent?: number | null;
  },
): Promise<void> {
  await updateVariantById(id, {
    name: data.name,
    price: roundMoney2(data.price),
    mrp: roundMoney2(data.mrp),
    barcode: data.barcode,
    productCode: data.productCode,
    purchasePrice: data.purchasePrice,
    taxRatePercent: data.taxRatePercent,
    unitId: data.unitId,
    markupPercent: data.markupPercent,
  });
  revalidatePath(`/admin/products/${productId}`);
  revalidatePublicCatalog();
}

export async function deleteVariantAction(
  id: string,
  productId: string,
): Promise<void> {
  await deleteVariantAndSupplyRows(id);
  revalidatePath(`/admin/products/${productId}`);
  revalidatePublicCatalog();
}
