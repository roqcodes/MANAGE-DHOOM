"use client";

import { cn } from "@/lib/utils";

export const INVENTORY_ACCENT = {
  link: "text-primary hover:text-primary/80",
  selectedRow: "data-[state=selected]:bg-accent/60",
  selectionBar: "border-border bg-accent/50",
  focus: "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
} as const;

export type InventoryViewFilter = "all" | "healthy" | "low" | "critical";

export const INVENTORY_VIEW_FILTERS: {
  id: InventoryViewFilter;
  label: string;
}[] = [
  { id: "all", label: "All" },
  { id: "healthy", label: "Healthy" },
  { id: "low", label: "Low stock" },
  { id: "critical", label: "Critical" },
];

export const DEFAULT_REORDER_POINT = 10;
export const DEFAULT_REORDER_QUANTITY = 10;

export function formatSku(variantId: string) {
  return variantId.slice(0, 8).toUpperCase();
}

export function stockUnits(stock: number | null | undefined) {
  return Math.max(0, Math.floor(Number(stock ?? 0)));
}

export function reservedStockUnits(reserved: number | null | undefined) {
  return Math.max(0, Math.floor(Number(reserved ?? 0)));
}

export function availableStockUnits(
  stock: number | null | undefined,
  reserved?: number | null | undefined,
) {
  return Math.max(0, stockUnits(stock) - reservedStockUnits(reserved));
}

export function reorderPointFor(
  reorderPoint: number | null | undefined,
): number {
  return Math.max(0, Math.floor(Number(reorderPoint ?? DEFAULT_REORDER_POINT)));
}

export function stockLevelFor(
  stock: number | null | undefined,
  reorderPoint?: number | null,
): Exclude<InventoryViewFilter, "all"> {
  const units = stockUnits(stock);
  const threshold = reorderPointFor(reorderPoint);
  if (units < 1) return "critical";
  if (units < threshold) return "low";
  return "healthy";
}

export function matchesInventoryViewFilter(
  row: {
    stock: number | null | undefined;
    reserved_stock?: number | null;
    reorder_point?: number | null;
  },
  filter: InventoryViewFilter,
): boolean {
  if (filter === "all") return true;
  const available = availableStockUnits(row.stock, row.reserved_stock);
  return stockLevelFor(available, row.reorder_point) === filter;
}

const TITLE_CASE_SMALL_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "for",
  "in",
  "on",
  "at",
  "to",
  "of",
  "with",
]);

export function toTitleCase(
  value: string | null | undefined,
  fallback = "—",
): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return fallback;

  return trimmed
    .toLowerCase()
    .split(/\s+/)
    .map((word, index) => {
      if (index > 0 && TITLE_CASE_SMALL_WORDS.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

export function StockStatusPill({
  stock,
  reorderPoint,
}: {
  stock: number | null | undefined;
  reorderPoint?: number | null;
}) {
  const level = stockLevelFor(stock, reorderPoint);

  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
        level === "critical"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : level === "low"
            ? "border-amber-200 bg-amber-50 text-amber-800"
            : "border-emerald-200 bg-emerald-50 text-emerald-700",
      )}
    >
      {level === "critical"
        ? "Out of stock"
        : level === "low"
          ? "Low stock"
          : "Healthy"}
    </span>
  );
}
