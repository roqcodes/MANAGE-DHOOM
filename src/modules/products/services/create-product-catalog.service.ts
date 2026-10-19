import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { safeRevalidateProductCatalog } from "@/lib/cache/safe-revalidate";
import { roundMoney as roundMoney2 } from "@/lib/decimal-precision";
import type { Json } from "@/lib/integrations/supabase/types";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { rethrowUniqueNameViolation } from "@/lib/erp/master-name-uniqueness";
import type {
  CatalogProductCreateSetup,
  CatalogProductVariantCreateInput,
  CreateCatalogProductInput,
  ProductCreateResult,
  ProductCreateStage,
} from "@/modules/products/types/product-create-result";
import { ensureDefaultProductVariant } from "@/modules/products/services/ensure-default-product-variant.service";
import {
  addProductImagesDeduped,
  addProductVideosDeduped,
} from "@/modules/products/services/product-media.service";
import { trimMasterName } from "@/lib/erp/master-name-uniqueness";
import { insertVariantGroup } from "@/modules/products/services/variant-groups.service";
import { insertVariantWithInventory } from "@/modules/products/services/product-variants.service";
import { addVariantImages } from "@/modules/products/services/variant-images.service";

type OperationRow = {
  operation_id: string;
  created_by: string;
  product_id: string | null;
  status: string;
  result: Record<string, unknown> | null;
};

function storedResult(row: OperationRow): ProductCreateResult | null {
  const raw = row.result;
  if (!raw || typeof raw !== "object") return null;
  const status = raw.status;
  const message = raw.message;
  const productId = raw.productId;
  if (
    status !== "success" &&
    status !== "partial" &&
    status !== "failed"
  ) {
    return null;
  }
  if (typeof message !== "string") return null;
  const pid =
    typeof productId === "string" ? productId : row.product_id ?? undefined;
  return {
    status,
    productId: pid,
    openProductHref: pid ? `/admin/products/${pid}` : undefined,
    message,
    stage: raw.stage as ProductCreateStage | undefined,
    warnings: Array.isArray(raw.warnings)
      ? raw.warnings.filter((w): w is string => typeof w === "string")
      : undefined,
    replayed: true,
  };
}

function productHref(productId: string): string {
  return `/admin/products/${productId}`;
}

async function reserveProductForOperation(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  operationId: string,
  input: CreateCatalogProductInput,
): Promise<{ productId: string; replayed: boolean }> {
  const { data, error } = await supabase.rpc(
    "catalog_product_create_reserve_product",
    {
      p_operation_id: operationId,
      p_name: input.name,
      p_description: input.description || null,
      p_category_id: input.categoryId || null,
      p_brand_id: input.brandId || null,
      p_image_url: input.imageUrl,
      p_variant_layout: input.variantLayout ?? "flat",
      p_item_type: input.itemType ?? "goods",
      p_hsn_sac: input.hsnSac ?? null,
      p_price: input.price ?? null,
      p_mrp: input.mrp ?? null,
      p_barcode: input.barcode ?? null,
      p_purchase_price: input.purchasePrice ?? null,
      p_tax_rate_percent: input.taxRatePercent ?? null,
    },
  );
  if (error) {
    rethrowUniqueNameViolation(error, "product");
    throw new Error(error.message);
  }
  const row = data as { product_id?: string; replayed?: boolean } | null;
  const productId = row?.product_id;
  if (!productId) throw new Error("Product reservation failed.");
  return { productId, replayed: Boolean(row?.replayed) };
}

function normName(name: string): string {
  return trimMasterName(name).toLowerCase();
}

async function findVariantGroupId(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  productId: string,
  groupName: string,
): Promise<string | null> {
  const target = normName(groupName);
  const { data, error } = await supabase
    .from("variant_groups")
    .select("id, name")
    .eq("product_id", productId);
  if (error) throw new Error(error.message);
  const hit = (data ?? []).find(
    (g) => normName(String(g.name ?? "")) === target,
  );
  return hit?.id ?? null;
}

async function findVariantId(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  productId: string,
  variantName: string,
  variantGroupId: string | null,
): Promise<string | null> {
  const target = normName(variantName);
  let query = supabase
    .from("product_variants")
    .select("id, name, variant_group_id")
    .eq("product_id", productId);
  if (variantGroupId) {
    query = query.eq("variant_group_id", variantGroupId);
  } else {
    query = query.is("variant_group_id", null);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const hit = (data ?? []).find(
    (v) => normName(String(v.name ?? "")) === target,
  );
  return hit?.id ?? null;
}

async function ensureVariantGroupId(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  productId: string,
  groupName: string,
  sortOrder: number,
): Promise<string> {
  const existing = await findVariantGroupId(supabase, productId, groupName);
  if (existing) return existing;
  try {
    return await insertVariantGroup({ productId, name: groupName, sortOrder });
  } catch (error) {
    const err = error as { code?: string };
    if (err?.code === "23505") {
      const raced = await findVariantGroupId(supabase, productId, groupName);
      if (raced) return raced;
    }
    throw error;
  }
}

async function ensureVariantWithInventory(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  input: {
    productId: string;
    name: string;
    price: number;
    mrp: number;
    stock?: number;
    variantGroupId?: string | null;
    barcode?: string | null;
    productCode?: string | null;
    purchasePrice?: number | null;
    taxRatePercent?: number | null;
    unitId?: string | null;
    markupPercent?: number | null;
  },
): Promise<string> {
  const groupId = input.variantGroupId ?? null;
  const existing = await findVariantId(
    supabase,
    input.productId,
    input.name,
    groupId,
  );
  if (existing) return existing;
  try {
    return await insertVariantWithInventory(input);
  } catch (error) {
    const err = error as { code?: string };
    if (err?.code === "23505") {
      const raced = await findVariantId(
        supabase,
        input.productId,
        input.name,
        groupId,
      );
      if (raced) return raced;
    }
    throw error;
  }
}

async function persistOperationState(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  operationId: string,
  patch: {
    productId?: string;
    status?: "in_progress" | "completed" | "partial";
    result?: ProductCreateResult;
  },
): Promise<void> {
  const update: {
    updated_at: string;
    product_id?: string;
    status?: string;
    result?: Json;
  } = { updated_at: new Date().toISOString() };
  if (patch.productId) update.product_id = patch.productId;
  if (patch.status) update.status = patch.status;
  if (patch.result) update.result = patch.result as Json;

  const { error } = await supabase
    .from("catalog_product_create_operations")
    .update(update)
    .eq("operation_id", operationId);
  if (error) throw new Error(error.message);
}

async function applyMedia(
  productId: string,
  imageUrls: string[] | undefined,
  videoUrls: string[] | undefined,
  warnings: string[],
): Promise<ProductCreateStage | undefined> {
  try {
    if (imageUrls && imageUrls.length > 0) {
      await addProductImagesDeduped(productId, imageUrls);
    }
    if (videoUrls && videoUrls.length > 0) {
      await addProductVideosDeduped(productId, videoUrls);
    }
  } catch (error) {
    warnings.push(
      error instanceof Error
        ? error.message
        : "Some media could not be saved.",
    );
    return "media";
  }
  return undefined;
}

async function reconcileVariantsForSetup(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  productId: string,
  setup: CatalogProductCreateSetup,
  primaryErp: CatalogProductVariantCreateInput | null,
): Promise<void> {
  if (setup.mode === "simple") {
    if (setup.ensureDefaultVariant) {
      await ensureDefaultProductVariant(productId);
    }
    return;
  }

  if (setup.mode === "flat") {
    for (let i = 0; i < setup.variants.length; i++) {
      const v = setup.variants[i]!;
      const erp = i === 0 && primaryErp ? primaryErp : v;
      const variantId = await ensureVariantWithInventory(supabase, {
        productId,
        name: v.name.trim(),
        price: roundMoney2(v.price),
        mrp: roundMoney2(v.mrp),
        stock: v.stock,
        barcode: erp.barcode ?? null,
        productCode: erp.productCode ?? null,
        purchasePrice: erp.purchasePrice ?? null,
        taxRatePercent: erp.taxRatePercent ?? null,
        unitId: erp.unitId ?? null,
        markupPercent: erp.markupPercent ?? null,
      });
      if (v.imageUrls && v.imageUrls.length > 0) {
        await addVariantImages(variantId, v.imageUrls);
      }
    }
    return;
  }

  for (let gi = 0; gi < setup.groups.length; gi++) {
    const g = setup.groups[gi]!;
    const groupId = await ensureVariantGroupId(
      supabase,
      productId,
      g.name.trim(),
      g.sortOrder ?? gi,
    );
    for (let ri = 0; ri < g.variants.length; ri++) {
      const row = g.variants[ri]!;
      const name = row.name.trim();
      if (!name) continue;
      const erp = gi === 0 && ri === 0 && primaryErp ? primaryErp : row;
      const variantId = await ensureVariantWithInventory(supabase, {
        productId,
        name,
        price: roundMoney2(row.price),
        mrp: roundMoney2(row.mrp),
        stock: row.stock,
        variantGroupId: groupId,
        barcode: erp.barcode ?? null,
        productCode: erp.productCode ?? null,
        purchasePrice: erp.purchasePrice ?? null,
        taxRatePercent: erp.taxRatePercent ?? null,
        unitId: erp.unitId ?? null,
        markupPercent: erp.markupPercent ?? null,
      });
      if (row.imageUrls && row.imageUrls.length > 0) {
        await addVariantImages(variantId, row.imageUrls);
      }
    }
  }
}

function buildPrimaryErpFromProduct(
  input: CreateCatalogProductInput,
): CatalogProductVariantCreateInput | null {
  return {
    name: input.name,
    price: input.price ?? 0,
    mrp: input.mrp ?? 0,
    barcode: input.barcode ?? null,
    productCode: null,
    purchasePrice: input.purchasePrice ?? null,
    taxRatePercent: input.taxRatePercent ?? null,
    unitId: null,
    markupPercent: null,
  };
}

export async function createCatalogProduct(
  input: CreateCatalogProductInput,
): Promise<ProductCreateResult> {
  const profile = await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const operationId = input.operationId.trim();
  if (!operationId) {
    return {
      status: "failed",
      message: "Save operation id is missing. Refresh and try again.",
    };
  }

  const { data: existingOp, error: loadErr } = await supabase
    .from("catalog_product_create_operations")
    .select("operation_id, created_by, product_id, status, result")
    .eq("operation_id", operationId)
    .maybeSingle();
  if (loadErr) throw new Error(loadErr.message);
  if (existingOp && existingOp.created_by !== profile.id) {
    throw new Error("This save operation cannot be resumed.");
  }

  let operation = (existingOp ?? null) as OperationRow | null;

  if (operation?.status === "completed") {
    const replay = storedResult(operation);
    if (replay?.productId) {
      safeRevalidateProductCatalog(replay.productId);
      return replay;
    }
  }

  const warnings: string[] = [];
  let productId = operation?.product_id ?? undefined;
  let partialStage: ProductCreateStage | undefined;

  try {
    const reserved = await reserveProductForOperation(
      supabase,
      operationId,
      input,
    );
    productId = reserved.productId;
    if (!operation) {
      operation = {
        operation_id: operationId,
        created_by: profile.id,
        product_id: productId,
        status: "in_progress",
        result: {},
      };
    } else {
      operation = { ...operation, product_id: productId };
    }

    const primaryErp = buildPrimaryErpFromProduct(input);

    try {
      await reconcileVariantsForSetup(
        supabase,
        productId,
        input.setup,
        primaryErp,
      );
    } catch (error) {
      partialStage = "variants";
      const result: ProductCreateResult = {
        status: "partial",
        productId,
        openProductHref: productHref(productId),
        stage: partialStage,
        message:
          "Product saved, but setup is incomplete. Open the product to finish setup.",
        warnings: [
          error instanceof Error ? error.message : "Variant setup failed.",
        ],
      };
      await persistOperationState(supabase, operationId, {
        productId,
        status: "partial",
        result,
      });
      safeRevalidateProductCatalog(productId);
      return result;
    }

    const mediaStage = await applyMedia(
      productId,
      input.imageUrls,
      input.videoUrls,
      warnings,
    );
    if (mediaStage) partialStage = mediaStage;

    safeRevalidateProductCatalog(productId);

    if (partialStage === "media") {
      const result: ProductCreateResult = {
        status: "partial",
        productId,
        openProductHref: productHref(productId),
        stage: "media",
        message:
          "Product created, but some media could not be uploaded. Open the product to add media.",
        warnings,
      };
      await persistOperationState(supabase, operationId, {
        productId,
        status: "partial",
        result,
      });
      return result;
    }

    const result: ProductCreateResult = {
      status: "success",
      productId,
      openProductHref: productHref(productId),
      message: "Product created successfully.",
      warnings: warnings.length > 0 ? warnings : undefined,
    };
    await persistOperationState(supabase, operationId, {
      productId,
      status: "completed",
      result,
    });
    return result;
  } catch (error) {
    if (productId) {
      const result: ProductCreateResult = {
        status: "partial",
        productId,
        openProductHref: productHref(productId),
        stage: partialStage ?? "product",
        message:
          "Product saved, but setup is incomplete. Open the product to finish setup.",
        warnings: [
          error instanceof Error ? error.message : "Setup could not be completed.",
        ],
      };
      try {
        await persistOperationState(supabase, operationId, {
          productId,
          status: "partial",
          result,
        });
      } catch {
        /* best effort */
      }
      safeRevalidateProductCatalog(productId);
      return result;
    }

    const errObj = error as { code?: string };
    if (errObj?.code === "23505") {
      rethrowUniqueNameViolation(errObj, "product");
    }

    const message =
      error instanceof Error ? error.message : "Could not create product.";
    return { status: "failed", message };
  }
}
