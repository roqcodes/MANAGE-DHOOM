import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { getAppSettings } from "@/modules/settings/services/app-settings.service";
import {
  computeOrderMargin,
  resolveListPrice,
  resolveReferenceCost,
} from "@/modules/pricing/pricing.resolver";
import { assertCompleteOrderItemSnapshotForInsert } from "@/modules/orders/services/order-items-immutable.service";
import { invokeRpc } from "@/lib/integrations/supabase/rpc";

const OUT_OF_STOCK_MSG = "Not enough stock in central warehouse";
const ERP_OUT_OF_STOCK_MSG = "Not enough stock at store";

function finalizeSnapshot(snapshot: OrderItemSnapshot): OrderItemSnapshot {
  assertCompleteOrderItemSnapshotForInsert({
    vendor_id: snapshot.vendor_id,
    base_price: snapshot.base_price,
    final_price: snapshot.final_price,
    margin_amount: snapshot.margin_amount,
    price: snapshot.final_price,
    product_name: snapshot.product_name,
  });
  return snapshot;
}

export interface OrderItemSnapshot {
  vendor_id: string | null;
  base_price: number;
  final_price: number;
  margin_amount: number;
  unit_price: number;
  product_name: string;
  product_id: string;
}

type VariantStockRow = { variant_id: string; available: number };

async function fetchOnlineAvailableByVariant(
  supabase: SupabaseClient,
  variantIds: string[],
): Promise<Map<string, number>> {
  const unique = [...new Set(variantIds)];
  const map = new Map<string, number>();
  if (unique.length === 0) return map;

  const { data, error } = await invokeRpc(supabase, "get_variants_online_available", {
    p_variant_ids: unique,
  });
  if (error) {
    for (const id of unique) {
      const { data: one, error: oneErr } = await invokeRpc(
        supabase,
        "get_variant_online_available",
        { p_variant_id: id },
      );
      if (oneErr) throw new Error(oneErr.message);
      map.set(id, Math.max(0, Math.floor(Number(one ?? 0))));
    }
    return map;
  }

  for (const row of (data ?? []) as VariantStockRow[]) {
    map.set(
      row.variant_id,
      Math.max(0, Math.floor(Number(row.available ?? 0))),
    );
  }
  for (const id of unique) {
    if (!map.has(id)) map.set(id, 0);
  }
  return map;
}

async function fetchStoreVariantAvailable(
  supabase: SupabaseClient,
  storeId: string,
  variantIds: string[],
): Promise<Map<string, number>> {
  const unique = [...new Set(variantIds)];
  const map = new Map<string, number>();
  if (unique.length === 0) return map;

  const { data, error } = await invokeRpc(
    supabase,
    "get_variants_store_inventory_available",
    { p_store_id: storeId, p_variant_ids: unique },
  );
  if (error) throw new Error(error.message);

  for (const row of (data ?? []) as VariantStockRow[]) {
    map.set(
      row.variant_id,
      Math.max(0, Math.floor(Number(row.available ?? 0))),
    );
  }
  for (const id of unique) {
    if (!map.has(id)) map.set(id, 0);
  }
  return map;
}

async function fetchLowestVendorBaseByVariant(
  supabase: SupabaseClient,
  variantIds: string[],
): Promise<Map<string, number | null>> {
  const unique = [...new Set(variantIds)];
  const map = new Map<string, number | null>();
  if (unique.length === 0) return map;

  const { data, error } = await supabase
    .from("vendor_products")
    .select("variant_id, base_price")
    .in("variant_id", unique)
    .gt("stock", 0);
  if (error) throw new Error(error.message);

  for (const id of unique) map.set(id, null);
  for (const row of data ?? []) {
    const vid = row.variant_id as string;
    const bp = Number(row.base_price ?? 0);
    if (!Number.isFinite(bp) || bp < 0) continue;
    const cur = map.get(vid);
    if (cur == null || bp < cur) map.set(vid, bp);
  }
  return map;
}

function snapshotFromVariantRow(
  variant: {
    id: string;
    product_id: string;
    price?: number | null;
    name?: string | null;
    products?: { name?: string | null } | null;
  },
  input: { quantity?: number; unitPriceOverride?: number | null },
  availableStock: number,
  referenceCost: number,
): OrderItemSnapshot {
  const qty = Math.max(1, Math.floor(input.quantity ?? 1));
  if (availableStock < qty) {
    throw new Error(
      availableStock === 0
        ? OUT_OF_STOCK_MSG
        : `Only ${availableStock} unit${availableStock !== 1 ? "s" : ""} in central warehouse (requested ${qty}).`,
    );
  }

  const listPrice = resolveListPrice(variant.price);
  if (listPrice <= 0) {
    throw new Error("This SKU has no valid list price. Set a selling price first.");
  }

  const finalPrice =
    input.unitPriceOverride != null && Number.isFinite(input.unitPriceOverride)
      ? resolveListPrice(input.unitPriceOverride)
      : listPrice;

  const product_name =
    [variant.products?.name, variant.name].filter(Boolean).join(" — ") || "Product";

  return finalizeSnapshot({
    vendor_id: null,
    base_price: referenceCost,
    final_price: finalPrice,
    margin_amount: computeOrderMargin(finalPrice, referenceCost),
    unit_price: finalPrice,
    product_name,
    product_id: variant.product_id,
  });
}

export type OrderLinePricingInput = {
  variantId: string;
  quantity?: number;
  unitPriceOverride?: number | null;
};

/**
 * Order snapshot: customer pays list price; sale gated on central inventory.
 * base_price stores reference vendor cost for margin reports (not customer price).
 */
export async function buildOrderItemSnapshots(
  lines: OrderLinePricingInput[],
): Promise<Map<string, OrderItemSnapshot>> {
  if (lines.length === 0) return new Map();

  const supabase = await createSupabaseServerClient();
  const variantIds = lines.map((l) => l.variantId);

  const { data: variantRows, error: vErr } = await supabase
    .from("product_variants")
    .select("id, product_id, price, name, products(name)")
    .in("id", variantIds);
  if (vErr) throw new Error(vErr.message);

  const variantById = new Map(
    (variantRows ?? []).map((row) => {
      const v = row as {
        id: string;
        product_id?: string | null;
        price?: number | null;
        name?: string | null;
        products?: { name?: string | null } | null;
      };
      return [v.id, v];
    }),
  );

  const [stockByVariant, vendorBaseByVariant] = await Promise.all([
    fetchOnlineAvailableByVariant(supabase, variantIds),
    fetchLowestVendorBaseByVariant(supabase, variantIds),
  ]);

  const result = new Map<string, OrderItemSnapshot>();
  for (const line of lines) {
    const variant = variantById.get(line.variantId);
    if (!variant?.product_id) {
      throw new Error("Variant or product not found.");
    }
    const referenceCost = resolveReferenceCost(
      vendorBaseByVariant.get(line.variantId) ?? null,
    );
    const snapshot = snapshotFromVariantRow(
      { ...variant, id: line.variantId, product_id: variant.product_id },
      line,
      stockByVariant.get(line.variantId) ?? 0,
      referenceCost,
    );
    result.set(line.variantId, snapshot);
  }
  return result;
}

export async function buildOrderItemSnapshot(
  input: OrderLinePricingInput,
): Promise<OrderItemSnapshot> {
  const map = await buildOrderItemSnapshots([input]);
  const snap = map.get(input.variantId);
  if (!snap) throw new Error("Variant or product not found.");
  return snap;
}

/** POS counter sale: gate on store `inventory` (matches `complete_pos_counter_sale`). */
export async function buildPosOrderItemSnapshots(
  storeId: string,
  lines: OrderLinePricingInput[],
): Promise<Map<string, OrderItemSnapshot>> {
  if (lines.length === 0) return new Map();

  const supabase = await createSupabaseServerClient();
  const variantIds = lines.map((l) => l.variantId);

  const { data: variantRows, error: vErr } = await supabase
    .from("product_variants")
    .select("id, product_id, price, name, products(name)")
    .in("id", variantIds);
  if (vErr) throw new Error(vErr.message);

  const variantById = new Map(
    (variantRows ?? []).map((row) => {
      const v = row as {
        id: string;
        product_id?: string | null;
        price?: number | null;
        name?: string | null;
        products?: { name?: string | null } | null;
      };
      return [v.id, v];
    }),
  );

  const [stockByVariant, vendorBaseByVariant] = await Promise.all([
    fetchStoreVariantAvailable(supabase, storeId, variantIds),
    fetchLowestVendorBaseByVariant(supabase, variantIds),
  ]);

  const result = new Map<string, OrderItemSnapshot>();
  for (const line of lines) {
    const variant = variantById.get(line.variantId);
    if (!variant?.product_id) {
      throw new Error("Variant or product not found.");
    }

    const qty = Math.max(1, Math.floor(line.quantity ?? 1));
    const storeStock = stockByVariant.get(line.variantId) ?? 0;
    if (storeStock < qty) {
      throw new Error(
        storeStock === 0
          ? ERP_OUT_OF_STOCK_MSG
          : `Only ${storeStock} unit${storeStock !== 1 ? "s" : ""} at store (requested ${qty}).`,
      );
    }

    const listPrice = resolveListPrice(variant.price);
    if (listPrice <= 0) {
      throw new Error("This SKU has no valid list price. Set a selling price first.");
    }

    const finalPrice =
      line.unitPriceOverride != null && Number.isFinite(line.unitPriceOverride)
        ? resolveListPrice(line.unitPriceOverride)
        : listPrice;

    const referenceCost = resolveReferenceCost(
      vendorBaseByVariant.get(line.variantId) ?? null,
    );

    const product_name =
      [variant.products?.name, variant.name].filter(Boolean).join(" — ") || "Product";

    result.set(
      line.variantId,
      finalizeSnapshot({
        vendor_id: null,
        base_price: referenceCost,
        final_price: finalPrice,
        margin_amount: computeOrderMargin(finalPrice, referenceCost),
        unit_price: finalPrice,
        product_name,
        product_id: variant.product_id,
      }),
    );
  }
  return result;
}

export type ProductLinePricingInput = {
  productId: string;
  storeId: string;
  quantity?: number;
  unitPriceOverride?: number | null;
};

/** ERP physical sales: product-level stock and pricing. */
export async function buildProductOrderItemSnapshots(
  lines: ProductLinePricingInput[],
): Promise<Map<string, OrderItemSnapshot>> {
  if (lines.length === 0) return new Map();

  const storeId = lines[0].storeId;
  const productIds = lines.map((l) => l.productId);
  const settings = await getAppSettings();
  const allowNegative = settings.allow_negative_store_stock;
  const supabase = await createSupabaseServerClient();

  const { data: productRows, error: pErr } = await supabase
    .from("products")
    .select("id, name, price, purchase_price")
    .in("id", productIds);
  if (pErr) throw new Error(pErr.message);

  const productById = new Map((productRows ?? []).map((p) => [p.id as string, p]));

  const { data: spiRows, error: spiErr } = await supabase
    .from("store_product_inventory")
    .select("product_id, stock, purchase_price")
    .eq("store_id", storeId)
    .in("product_id", productIds);
  if (spiErr) throw new Error(spiErr.message);

  const spiByProduct = new Map(
    (spiRows ?? []).map((r) => [r.product_id as string, r]),
  );

  const result = new Map<string, OrderItemSnapshot>();
  for (const line of lines) {
    const productRow = productById.get(line.productId);
    if (!productRow) throw new Error("Product not found.");

    const qty = Math.max(1, Math.floor(line.quantity ?? 1));
    const spi = spiByProduct.get(line.productId);
    const storeStock = Math.floor(Number(spi?.stock ?? 0));
    if (!allowNegative && storeStock < qty) {
      const displayStock = Math.max(0, storeStock);
      throw new Error(
        displayStock === 0
          ? ERP_OUT_OF_STOCK_MSG
          : `Only ${displayStock} unit${displayStock !== 1 ? "s" : ""} at store (requested ${qty}).`,
      );
    }

    const listPrice = resolveListPrice(productRow.price);
    const overridePrice =
      line.unitPriceOverride != null && Number.isFinite(line.unitPriceOverride)
        ? resolveListPrice(line.unitPriceOverride)
        : 0;

    let finalPrice: number;
    if (overridePrice > 0) {
      finalPrice = overridePrice;
    } else if (listPrice <= 0) {
      throw new Error("This product has no valid selling price.");
    } else {
      finalPrice = listPrice;
    }

    const storeWac =
      spi?.purchase_price != null ? Number(spi.purchase_price) : null;
    const referenceCost = resolveReferenceCost(
      storeWac ??
        (productRow.purchase_price != null ? Number(productRow.purchase_price) : null),
    );

    result.set(
      line.productId,
      finalizeSnapshot({
        vendor_id: null,
        base_price: referenceCost,
        final_price: finalPrice,
        margin_amount: computeOrderMargin(finalPrice, referenceCost),
        unit_price: finalPrice,
        product_name: productRow.name ?? "Product",
        product_id: line.productId,
      }),
    );
  }
  return result;
}

export async function buildProductOrderItemSnapshot(
  input: ProductLinePricingInput,
): Promise<OrderItemSnapshot> {
  const map = await buildProductOrderItemSnapshots([input]);
  const snap = map.get(input.productId);
  if (!snap) throw new Error("Product not found.");
  return snap;
}
