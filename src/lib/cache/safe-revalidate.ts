import "server-only";

import { revalidatePath } from "next/cache";

import { revalidatePublicCatalog } from "@/lib/cache/public-catalog-cache";

/** Revalidate admin product routes and public catalog without failing the caller. */
export function safeRevalidateProductCatalog(productId?: string): void {
  try {
    revalidatePath("/admin/products");
    if (productId) {
      revalidatePath(`/admin/products/${productId}`);
    }
    revalidatePublicCatalog();
  } catch (error) {
    console.error("[safeRevalidateProductCatalog]", {
      stage: "product_catalog",
      productId: productId ?? null,
      error,
    });
  }
}

/** Revalidate one or more admin paths without failing the caller. */
export function safeRevalidatePaths(
  paths: string[],
  context: { stage: string; entityId?: string },
): void {
  try {
    for (const path of paths) {
      revalidatePath(path);
    }
  } catch (error) {
    console.error("[safeRevalidatePaths]", {
      stage: context.stage,
      entityId: context.entityId ?? null,
      paths,
      error,
    });
  }
}

export function safeRevalidateVendors(vendorId?: string): void {
  safeRevalidatePaths(
    vendorId ? ["/admin/vendors", `/admin/vendors/${vendorId}`] : ["/admin/vendors"],
    { stage: "vendors", entityId: vendorId },
  );
}
