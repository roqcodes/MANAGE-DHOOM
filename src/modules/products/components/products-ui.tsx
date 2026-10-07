"use client";

import type { ProductWithCategoryListItem } from "@/common/admin/types";
import { cn } from "@/lib/utils";

export type ProductStatusFilter =
  | "all"
  | "active"
  | "draft"
  | "archived"
  | "out_of_stock";

export const PRODUCT_STATUS_FILTERS: {
  id: ProductStatusFilter;
  label: string;
}[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "draft", label: "Draft" },
  { id: "archived", label: "Archived" },
  { id: "out_of_stock", label: "Out of Stock" },
];

export const ALL_CATEGORIES = "__all__";
export const UNCATEGORIZED = "__uncategorized__";

import { formatCurrencyAmount } from "@/lib/format-currency";

export function formatProductPrice(n: number | null) {
  if (n == null || !Number.isFinite(n)) return "—";
  return formatCurrencyAmount(n);
}

export function formatSkuLabel(product: ProductWithCategoryListItem) {
  const shortId = product.id.split("-")[0]?.slice(0, 4).toUpperCase() ?? "0000";
  const sku = product.sku_label ?? `PRD-${shortId}`;
  return `SKU: PRD-${shortId} | ${sku}`;
}

export function productDisplayStatus(product: ProductWithCategoryListItem) {
  if (product.stock_total <= 0) return "out_of_stock" as const;
  if (product.is_active === false) return "draft" as const;
  return "active" as const;
}

export function matchesProductStatusFilter(
  product: ProductWithCategoryListItem,
  filter: ProductStatusFilter,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "active":
      return product.is_active === true && product.stock_total > 0;
    case "draft":
      return product.is_active === false;
    case "archived":
      return product.is_active === false;
    case "out_of_stock":
      return product.stock_total <= 0;
    default:
      return true;
  }
}

export function ProductStatusBadge({
  product,
}: {
  product: ProductWithCategoryListItem;
}) {
  const status = productDisplayStatus(product);

  const styles = {
    active: "bg-emerald-100 text-emerald-800",
    draft: "bg-muted text-muted-foreground",
    out_of_stock: "bg-rose-100 text-rose-800",
  } as const;

  const labels = {
    active: "Active",
    draft: "Draft",
    out_of_stock: "Out of Stock",
  } as const;

  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
        styles[status],
      )}
    >
      {labels[status]}
    </span>
  );
}

export function StockBadge({ stock }: { stock: number }) {
  const out = stock <= 0;

  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums",
        out ? "bg-rose-100 text-rose-800" : "bg-muted text-foreground",
      )}
    >
      {stock.toLocaleString("en-IN", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })}
    </span>
  );
}

export function EnabledBadge({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
        enabled
          ? "bg-emerald-100 text-emerald-800"
          : "bg-muted text-muted-foreground",
      )}
    >
      {enabled ? "Yes" : "No"}
    </span>
  );
}
