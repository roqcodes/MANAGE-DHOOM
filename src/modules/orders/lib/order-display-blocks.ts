import type { OrderItem, VariantGroup } from "@/common/admin/types";

export type OrderLineItem = OrderItem;

export type OrderSingleBlock = {
  type: "single";
  item: OrderLineItem;
};

export type OrderGroupedBlock = {
  type: "grouped";
  productId: string;
  productName: string;
  imageUrl: string | null;
  /** Grouped = variant-group sections; flat = variant rows under one product header. */
  layout: "grouped" | "flat";
  items: OrderLineItem[];
};

export type OrderDisplayBlock = OrderSingleBlock | OrderGroupedBlock;

export type OrderItemSection = {
  key: string;
  title: string;
  items: OrderLineItem[];
};

function resolveProductId(item: OrderLineItem): string | null {
  return item.product_id ?? item.variant_meta?.product?.id ?? null;
}

function countLinesPerProduct(items: OrderLineItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const productId = resolveProductId(item);
    if (productId) counts.set(productId, (counts.get(productId) ?? 0) + 1);
  }
  return counts;
}

function resolveBlockLayout(
  item: OrderLineItem,
  productId: string,
  variantGroups: Record<string, VariantGroup[]>,
): "grouped" | "flat" {
  const product = item.variant_meta?.product;
  if (
    product?.variant_layout === "grouped" &&
    (variantGroups[productId]?.length ?? 0) > 0
  ) {
    return "grouped";
  }
  return "flat";
}

function shouldGroupUnderProduct(
  item: OrderLineItem,
  variantGroups: Record<string, VariantGroup[]>,
  lineCounts: Map<string, number>,
): boolean {
  const productId = resolveProductId(item);
  if (!productId) return false;

  const product = item.variant_meta?.product;
  if (
    product?.variant_layout === "grouped" &&
    (variantGroups[productId]?.length ?? 0) > 0
  ) {
    return true;
  }

  return (lineCounts.get(productId) ?? 0) > 1;
}

export function buildOrderDisplayBlocks(
  items: OrderLineItem[],
  variantGroups: Record<string, VariantGroup[]> = {},
): OrderDisplayBlock[] {
  const blocks: OrderDisplayBlock[] = [];
  const groupedByProduct = new Map<string, OrderGroupedBlock>();
  const lineCounts = countLinesPerProduct(items);

  for (const item of items) {
    const productId = resolveProductId(item);
    if (!productId || !shouldGroupUnderProduct(item, variantGroups, lineCounts)) {
      blocks.push({ type: "single", item });
      continue;
    }

    const existing = groupedByProduct.get(productId);
    if (existing) {
      existing.items.push(item);
    } else {
      const product = item.variant_meta?.product;
      const block: OrderGroupedBlock = {
        type: "grouped",
        productId,
        productName:
          product?.name?.trim() || parseProductName(item.product_name).product,
        imageUrl: item.variant_meta?.image_url ?? product?.image_url ?? null,
        layout: resolveBlockLayout(item, productId, variantGroups),
        items: [item],
      };
      groupedByProduct.set(productId, block);
      blocks.push(block);
    }
  }

  return blocks;
}

export function buildOrderItemSections(
  items: OrderLineItem[],
  groups: VariantGroup[],
): OrderItemSection[] {
  const sorted = [...groups].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const groupIds = new Set(sorted.map((g) => g.id));
  const sections: OrderItemSection[] = [];

  for (const g of sorted) {
    const sectionItems = items.filter(
      (i) => i.variant_meta?.variant_group_id === g.id,
    );
    if (sectionItems.length === 0) continue;
    sections.push({
      key: g.id,
      title: (g.name ?? "").trim() || "Unnamed",
      items: sectionItems,
    });
  }

  const ungrouped = items.filter((i) => {
    const gid = i.variant_meta?.variant_group_id;
    return !gid || !groupIds.has(gid);
  });
  if (ungrouped.length > 0) {
    sections.push({ key: "__none", title: "Other", items: ungrouped });
  }

  return sections;
}

export function orderItemUnitPrice(item: OrderLineItem): number {
  return item.final_price != null
    ? Number(item.final_price)
    : Number(item.price ?? 0);
}

export function orderItemLineTotal(item: OrderLineItem): number {
  return orderItemUnitPrice(item) * Number(item.quantity ?? 1);
}

export function sectionQtyTotal(items: OrderLineItem[]): number {
  return items.reduce((sum, i) => sum + Number(i.quantity ?? 0), 0);
}

export function blockLineTotal(items: OrderLineItem[]): number {
  return items.reduce((sum, i) => sum + orderItemLineTotal(i), 0);
}

/** Split snapshot `product_name` ("Product — Model") when catalog meta is missing. */
export function parseProductName(productName: string | null | undefined): {
  product: string;
  variant: string | null;
} {
  const raw = (productName ?? "").trim();
  if (!raw) return { product: "Item", variant: null };
  const parts = raw.split(/\s*[—–-]\s*/);
  if (parts.length >= 2) {
    return {
      product: parts[0]!.trim() || "Item",
      variant: parts.slice(1).join(" — ").trim() || null,
    };
  }
  return { product: raw, variant: null };
}

export function orderLineVariantLabel(item: OrderLineItem): string {
  const metaName = item.variant_meta?.name?.trim();
  if (metaName) return metaName;
  const parsed = parseProductName(item.product_name);
  return parsed.variant ?? parsed.product;
}

export function orderLineProductLabel(item: OrderLineItem): string {
  const metaProduct = item.variant_meta?.product?.name?.trim();
  if (metaProduct) return metaProduct;
  return parseProductName(item.product_name).product;
}
