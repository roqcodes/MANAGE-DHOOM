import "server-only";

import {
  requireAdminOnlyProfile,
  requireAdminOrManagerProfile,
} from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import {
  assertVariantsNotLinkedToOrdersOrPurchaseOrders,
  deleteVariantSupplyRowsWithoutLinkCheck,
} from "@/modules/products/services/product-variants.service";
import type {
  Paginated,
  ProductCatalogStats,
  ProductVariant,
  ProductWithCategory,
  ProductWithCategoryListItem,
  VariantImage,
} from "@/common/admin/types";
import { PAGE_SIZE } from "@/common/admin/types";
import { invokeRpc } from "@/lib/integrations/supabase/rpc";

export async function getProducts(
  page = 0,
  categoryId: string | null = null,
  storeId: string | null = null,
): Promise<Paginated<ProductWithCategoryListItem>> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const from = page * PAGE_SIZE;

  let query = supabase
    .from("products")
    .select(
      "id,name,description,category_id,brand_id,image_url,is_active,use_smart_pricing,specs,variant_layout,item_type,hsn_sac,price,mrp,barcode,purchase_price,tax_rate_percent,created_at,categories(id,name,parent_id,thumbnail_url,image_url,sort_order,is_active,slug,description,created_at),brands(id,name,logo_url,image_url,sort_order,is_active,slug,description,created_at)",
    );

  let countQuery = supabase
    .from("products")
    .select("id", { count: "exact", head: true });

  if (categoryId) {
    if (categoryId === "__uncategorized__") {
      query = query.is("category_id", null);
      countQuery = countQuery.is("category_id", null);
    } else {
      query = query.eq("category_id", categoryId);
      countQuery = countQuery.eq("category_id", categoryId);
    }
  }

  query = query.order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1);

  const [dataResult, countResult] = await Promise.all([query, countQuery]);
  const rows = (dataResult.data ?? []) as unknown as ProductWithCategory[];
  const enriched = await enrichProductsList(supabase, rows, storeId);

  return {
    data: enriched,
    total: countResult.count ?? 0,
  };
}

async function enrichProductsList(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  products: ProductWithCategory[],
  storeId: string | null = null,
): Promise<ProductWithCategoryListItem[]> {
  if (products.length === 0) return [];

  const productIds = products.map((p) => p.id);
  const { data: variantRows } = await supabase
    .from("product_variants")
    .select(
      "id,product_id,name,price,mrp,barcode,product_code,purchase_price,tax_rate_percent",
    )
    .in("product_id", productIds)
    .order("created_at", { ascending: true });

  const variants = variantRows ?? [];
  const variantIds = variants.map((v) => v.id);

  const stockByVariant = new Map<string, number>();
  if (variantIds.length > 0) {
    const { data: inventoryRows } = await supabase
      .from("inventory")
      .select("variant_id,stock")
      .in("variant_id", variantIds);

    for (const row of inventoryRows ?? []) {
      stockByVariant.set(row.variant_id, Number(row.stock ?? 0));
    }
  }

  const storeStockByVariant = new Map<string, number>();
  const storeStockByProduct = new Map<string, number>();
  let storeName: string | null = null;
  if (storeId) {
    const [{ data: storeRow }, { data: storeInventoryRows }] = await Promise.all([
      supabase.from("stores").select("name").eq("id", storeId).maybeSingle(),
      supabase
        .from("store_product_inventory")
        .select("product_id,stock,sales_price")
        .eq("store_id", storeId)
        .in("product_id", productIds),
    ]);
    storeName = storeRow?.name ?? null;
    for (const row of storeInventoryRows ?? []) {
      storeStockByProduct.set(row.product_id, Number(row.stock ?? 0));
    }
    for (const v of variants) {
      const pid = v.product_id as string | null;
      if (pid) storeStockByVariant.set(v.id, storeStockByProduct.get(pid) ?? 0);
    }
  }

  const summaryByProduct = new Map<
    string,
    {
      stock: number;
      storeStock: number;
      priceMin: number | null;
      mrpMin: number | null;
      count: number;
      firstSku: string | null;
      barcode: string | null;
      productCode: string | null;
      purchasePrice: number | null;
      taxRatePercent: number | null;
    }
  >();

  for (const v of variants) {
    const pid = v.product_id as string | null;
    if (!pid) continue;

    const centralStock = stockByVariant.get(v.id) ?? 0;
    const storeStock = storeId ? (storeStockByVariant.get(v.id) ?? 0) : 0;
    const stock = storeId ? storeStock : centralStock;
    const price = v.price != null ? Number(v.price) : null;
    const mrp = v.mrp != null ? Number(v.mrp) : null;
    const purchasePrice =
      v.purchase_price != null ? Number(v.purchase_price) : null;
    const taxRate =
      v.tax_rate_percent != null ? Number(v.tax_rate_percent) : null;
    const existing = summaryByProduct.get(pid) ?? {
      stock: 0,
      storeStock: 0,
      priceMin: null,
      mrpMin: null,
      count: 0,
      firstSku: null,
      barcode: null,
      productCode: null,
      purchasePrice: null,
      taxRatePercent: null,
    };

    existing.stock += stock;
    if (storeId) existing.storeStock += storeStock;
    existing.count += 1;
    if (existing.firstSku == null) {
      existing.firstSku =
        v.name?.trim() ||
        `PRD-${v.id.split("-")[0]?.slice(0, 4).toUpperCase() ?? v.id.slice(0, 8)}`;
      existing.barcode = v.barcode ?? null;
      existing.productCode = v.product_code ?? null;
      existing.purchasePrice = purchasePrice;
      existing.taxRatePercent = taxRate;
    }
    if (price != null && Number.isFinite(price)) {
      existing.priceMin =
        existing.priceMin == null ? price : Math.min(existing.priceMin, price);
    }
    if (mrp != null && Number.isFinite(mrp) && mrp > 0) {
      existing.mrpMin =
        existing.mrpMin == null ? mrp : Math.min(existing.mrpMin, mrp);
    }

    summaryByProduct.set(pid, existing);
  }

  return products.map((product) => {
    const summary = summaryByProduct.get(product.id);
    const productPrice =
      product.price != null ? Number(product.price) : null;
    const productMrp = product.mrp != null ? Number(product.mrp) : null;
    const productStoreStock = storeId
      ? (storeStockByProduct.get(product.id) ?? 0)
      : 0;

    if (!summary || summary.count === 0) {
      return {
        ...product,
        stock_total: storeId ? productStoreStock : 0,
        price_min: productPrice,
        mrp_min: productMrp,
        variant_count: 0,
        sku_label: null,
        barcode: product.barcode ?? null,
        product_code: null,
        purchase_price:
          product.purchase_price != null
            ? Number(product.purchase_price)
            : null,
        tax_rate_percent:
          product.tax_rate_percent != null
            ? Number(product.tax_rate_percent)
            : null,
        store_stock: storeId ? productStoreStock : null,
        store_name: storeId ? storeName : null,
      };
    }

    return {
      ...product,
      stock_total: summary.stock,
      price_min: summary.priceMin ?? productPrice,
      mrp_min: summary.mrpMin ?? productMrp,
      variant_count: summary.count,
      sku_label: summary.firstSku,
      barcode: summary.barcode ?? product.barcode ?? null,
      product_code: summary.productCode,
      purchase_price: summary.purchasePrice,
      tax_rate_percent: summary.taxRatePercent,
      store_stock: storeId ? summary.storeStock : null,
      store_name: storeId ? storeName : null,
    };
  });
}

export async function getProductCatalogStats(): Promise<ProductCatalogStats> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const rpc = await invokeRpc(supabase, "get_admin_product_catalog_stats");
  if (!rpc.error && rpc.data && typeof rpc.data === "object") {
    const row = rpc.data as {
      total?: number;
      active?: number;
      inactive?: number;
      categories_count?: number;
      uncategorized?: number;
      out_of_stock?: number;
      inventory_value?: number;
    };
    return {
      total: Number(row.total ?? 0),
      active: Number(row.active ?? 0),
      inactive: Number(row.inactive ?? 0),
      categoriesCount: Number(row.categories_count ?? 0),
      uncategorized: Number(row.uncategorized ?? 0),
      categoryCounts: {},
      outOfStock: Number(row.out_of_stock ?? 0),
      inventoryValue: Number(row.inventory_value ?? 0),
    };
  }

  const [
    totalResult,
    activeResult,
    categoriesCountResult,
    uncategorizedResult,
  ] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    supabase.from("categories").select("id", { count: "exact", head: true }),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .is("category_id", null),
  ]);

  const total = totalResult.count ?? 0;
  const active = activeResult.count ?? 0;

  return {
    total,
    active,
    inactive: Math.max(0, total - active),
    categoriesCount: categoriesCountResult.count ?? 0,
    uncategorized: uncategorizedResult.count ?? 0,
    categoryCounts: {},
    outOfStock: 0,
    inventoryValue: 0,
  };
}

export async function getProductById(
  id: string,
): Promise<ProductWithCategory | null> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("products")
    .select(
      "id,name,description,category_id,brand_id,image_url,is_active,use_smart_pricing,specs,variant_layout,item_type,hsn_sac,price,mrp,barcode,purchase_price,tax_rate_percent,created_at,categories(id,name,parent_id,thumbnail_url,image_url,sort_order,is_active,slug,description,created_at),brands(id,name,logo_url,image_url,sort_order,is_active,slug,description,created_at)",
    )
    .eq("id", id)
    .maybeSingle();
  return data as unknown as ProductWithCategory | null;
}

export async function getProductVariants(
  productId: string,
): Promise<ProductVariant[]> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("product_variants")
    .select(
      "id,product_id,name,price,mrp,variant_group_id,barcode,product_code,purchase_price,tax_rate_percent,unit_id,markup_percent,created_at,variant_images(id,variant_id,url,is_preview,sort_order,created_at)",
    )
    .eq("product_id", productId)
    .order("created_at", { ascending: true });

  // Fall back to a plain select if the variant_images relation isn't available
  // yet (e.g. the migration hasn't been applied), so variants still render.
  if (error) {
    const { data: plain } = await supabase
      .from("product_variants")
      .select(
        "id,product_id,name,price,mrp,variant_group_id,barcode,product_code,purchase_price,tax_rate_percent,unit_id,markup_percent,created_at",
      )
      .eq("product_id", productId)
      .order("created_at", { ascending: true });
    const plainVariants = ((plain ?? []) as Omit<ProductVariant, "images">[]).map(
      (v) => ({
        ...v,
        images: [],
      }),
    );
    return attachCentralStock(supabase, plainVariants);
  }

  const variants = (
    (data ?? []) as unknown as (Omit<ProductVariant, "images"> & {
      variant_images?: VariantImage[];
    })[]
  ).map((row) => {
    const { variant_images, ...variant } = row;
    return { ...variant, images: sortVariantImages(variant_images ?? []) };
  });

  return attachCentralStock(supabase, variants);
}

async function attachCentralStock(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  variants: ProductVariant[],
): Promise<ProductVariant[]> {
  if (variants.length === 0) return variants;

  const variantIds = variants.map((v) => v.id);
  const { data: inventoryRows } = await supabase
    .from("inventory")
    .select("variant_id,stock")
    .in("variant_id", variantIds);

  const stockByVariant = new Map<string, number>();
  for (const row of inventoryRows ?? []) {
    stockByVariant.set(row.variant_id, Number(row.stock ?? 0));
  }

  return variants.map((v) => ({
    ...v,
    central_stock: stockByVariant.get(v.id) ?? 0,
  }));
}

/** Preview first, then by sort_order, then by creation time for stable display. */
function sortVariantImages(images: VariantImage[]): VariantImage[] {
  return [...images].sort((a, b) => {
    if (a.is_preview !== b.is_preview) return a.is_preview ? -1 : 1;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return (a.created_at ?? "").localeCompare(b.created_at ?? "");
  });
}

export async function countVariantsForProduct(productId: string): Promise<number> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("product_variants")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId);
  return count ?? 0;
}

export async function insertProduct(input: {
  name: string;
  description: string | null;
  categoryId: string | null;
  brandId: string | null;
  imageUrl: string | null;
  variantLayout?: "flat" | "grouped";
  itemType?: "goods" | "service";
  hsnSac?: string | null;
  price?: number | null;
  mrp?: number | null;
  barcode?: string | null;
  purchasePrice?: number | null;
  taxRatePercent?: number | null;
}): Promise<string> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .insert({
      name: input.name,
      description: input.description,
      category_id: input.categoryId,
      brand_id: input.brandId,
      image_url: input.imageUrl,
      variant_layout: input.variantLayout ?? "flat",
      item_type: input.itemType ?? "goods",
      hsn_sac: input.hsnSac ?? null,
      price: input.price ?? null,
      mrp: input.mrp ?? null,
      barcode: input.barcode ?? null,
      purchase_price: input.purchasePrice ?? null,
      tax_rate_percent: input.taxRatePercent ?? null,
      is_active: true,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function updateProductById(
  id: string,
  input: {
    name: string;
    description: string | null;
    categoryId: string | null;
    brandId: string | null;
    imageUrl: string | null;
    itemType?: "goods" | "service";
    hsnSac?: string | null;
    price?: number | null;
    mrp?: number | null;
    barcode?: string | null;
    purchasePrice?: number | null;
    taxRatePercent?: number | null;
  },
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("products")
    .update({
      name: input.name,
      description: input.description,
      category_id: input.categoryId,
      brand_id: input.brandId,
      image_url: input.imageUrl,
      ...(input.itemType !== undefined ? { item_type: input.itemType } : {}),
      ...(input.hsnSac !== undefined ? { hsn_sac: input.hsnSac } : {}),
      ...(input.price !== undefined ? { price: input.price } : {}),
      ...(input.mrp !== undefined ? { mrp: input.mrp } : {}),
      ...(input.barcode !== undefined ? { barcode: input.barcode } : {}),
      ...(input.purchasePrice !== undefined
        ? { purchase_price: input.purchasePrice }
        : {}),
      ...(input.taxRatePercent !== undefined
        ? { tax_rate_percent: input.taxRatePercent }
        : {}),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setProductActive(id: string, isActive: boolean): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("products")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setProductsActiveByIds(
  ids: string[],
  isActive: boolean,
): Promise<void> {
  if (ids.length === 0) return;

  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("products")
    .update({ is_active: isActive })
    .in("id", ids);
  if (error) throw new Error(error.message);
}

export async function setProductVariantLayout(
  productId: string,
  layout: "flat" | "grouped",
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("products")
    .update({ variant_layout: layout })
    .eq("id", productId);
  if (error) throw new Error(error.message);
}

/** Flat/simple → grouped: keeps existing SKUs, assigns them to a default group. */
export async function upgradeProductToGroupedLayout(
  productId: string,
  groupName = "Models",
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data: variants, error: variantErr } = await supabase
    .from("product_variants")
    .select("id, variant_group_id")
    .eq("product_id", productId)
    .order("created_at", { ascending: true });

  if (variantErr) throw new Error(variantErr.message);
  if (!variants?.length) {
    throw new Error("Add at least one SKU before organizing into variant groups.");
  }

  const { data: groups, error: groupErr } = await supabase
    .from("variant_groups")
    .select("id")
    .eq("product_id", productId)
    .order("sort_order", { ascending: true });

  if (groupErr) throw new Error(groupErr.message);

  let groupId = groups?.[0]?.id;
  if (!groupId) {
    const { data: inserted, error: insErr } = await supabase
      .from("variant_groups")
      .insert({
        product_id: productId,
        name: groupName.trim() || "Models",
        sort_order: 0,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);
    groupId = inserted?.id;
  }

  if (!groupId) throw new Error("Could not create variant group.");

  const ungroupedIds = variants
    .filter((v) => !v.variant_group_id)
    .map((v) => v.id);

  if (ungroupedIds.length > 0) {
    const { error: assignErr } = await supabase
      .from("product_variants")
      .update({ variant_group_id: groupId })
      .in("id", ungroupedIds);
    if (assignErr) throw new Error(assignErr.message);
  }

  const { error: layoutErr } = await supabase
    .from("products")
    .update({ variant_layout: "grouped" })
    .eq("id", productId);
  if (layoutErr) throw new Error(layoutErr.message);
}

/** Grouped → flat: keeps all SKUs and stock; removes group organization. */
export async function downgradeProductToFlatLayout(productId: string): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data: variants, error: variantErr } = await supabase
    .from("product_variants")
    .select("id")
    .eq("product_id", productId);

  if (variantErr) throw new Error(variantErr.message);
  if (!variants?.length) {
    throw new Error("Add at least one SKU before changing catalog layout.");
  }

  const variantIds = variants.map((v) => v.id);
  const { error: ungroupErr } = await supabase
    .from("product_variants")
    .update({ variant_group_id: null })
    .in("id", variantIds);
  if (ungroupErr) throw new Error(ungroupErr.message);

  const { error: deleteGroupsErr } = await supabase
    .from("variant_groups")
    .delete()
    .eq("product_id", productId);
  if (deleteGroupsErr) throw new Error(deleteGroupsErr.message);

  const { error: layoutErr } = await supabase
    .from("products")
    .update({ variant_layout: "flat" })
    .eq("id", productId);
  if (layoutErr) throw new Error(layoutErr.message);
}

export async function updateProductSpecs(
  id: string,
  specs: Record<string, string>,
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("products").update({ specs }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteProduct(productId: string): Promise<void> {
  await requireAdminOnlyProfile();
  const supabase = await createSupabaseServerClient();

  const { data: variants, error: variantErr } = await supabase
    .from("product_variants")
    .select("id")
    .eq("product_id", productId);
  if (variantErr) throw new Error(variantErr.message);

  const variantIds = (variants ?? []).map((v) => v.id);
  if (variantIds.length > 0) {
    await assertVariantsNotLinkedToOrdersOrPurchaseOrders(variantIds);
    for (const variantId of variantIds) {
      await deleteVariantSupplyRowsWithoutLinkCheck(variantId);
    }
  }

  const { error: pricingErr } = await supabase
    .from("pricing_rules")
    .delete()
    .eq("product_id", productId);
  if (pricingErr) throw new Error(pricingErr.message);

  const { error } = await supabase.from("products").delete().eq("id", productId);
  if (error) throw new Error(error.message);
}

/** @deprecated Use deleteProduct */
export async function deleteProductIfNoVariants(productId: string): Promise<void> {
  await deleteProduct(productId);
}
