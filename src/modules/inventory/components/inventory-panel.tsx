"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Ban, ChevronDown, Columns3, Search } from "lucide-react";

import type { InventoryCatalogStats, InventoryWithVariant } from "@/common/admin/types";
import { Pagination } from "@/modules/admin/components/pagination";
import {
  exportInventoryCsv,
  InventoryBulkActionBar,
  InventoryDataTable,
} from "@/modules/inventory/components/inventory-data-table";
import { InventoryMetricsBar } from "@/modules/inventory/components/inventory-metrics-bar";
import {
  formatSku,
  INVENTORY_ACCENT,
  INVENTORY_VIEW_FILTERS,
  matchesInventoryViewFilter,
  type InventoryViewFilter,
} from "@/modules/inventory/components/inventory-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

export function InventoryPanel({
  inventory,
  total,
  page,
  stats,
  hideMetrics = false,
}: {
  inventory: InventoryWithVariant[];
  total: number;
  page: number;
  stats: InventoryCatalogStats;
  hideMetrics?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [viewFilter, setViewFilter] = useState<InventoryViewFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return inventory.filter((row) => {
      if (!matchesInventoryViewFilter(row, viewFilter)) return false;
      if (!q) return true;

      const variantName = (row.product_variants?.name ?? "").toLowerCase();
      const productName = (
        row.product_variants?.products?.name ?? ""
      ).toLowerCase();
      const sku = formatSku(row.variant_id).toLowerCase();
      return (
        variantName.includes(q) || productName.includes(q) || sku.includes(q)
      );
    });
  }, [inventory, search, viewFilter]);

  const isFiltering = search.trim().length > 0 || viewFilter !== "all";

  const activeFilterLabel =
    INVENTORY_VIEW_FILTERS.find((f) => f.id === viewFilter)?.label ?? "All";

  return (
    <div className="flex flex-col gap-4">
      {!hideMetrics ? (
        <InventoryMetricsBar
          stats={stats}
          onExport={() => exportInventoryCsv(filtered)}
        />
      ) : (
        <p className="text-xs text-muted-foreground">
          Online stock is read-only. Increase quantities via{" "}
          <strong>Store → Online transfer</strong>, then allocate variants under
          the Pending tab.
        </p>
      )}

      <Card className="overflow-hidden border border-border py-0 ring-0">
        <CardContent className="flex flex-col gap-0 p-0">
          <div className="border-b p-2">
            <InputGroup className="h-9">
              <InputGroupAddon align="inline-start" className="pl-1">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <InputGroupButton
                        variant="ghost"
                        size="sm"
                        className={cn("gap-1 px-2", INVENTORY_ACCENT.focus)}
                      />
                    }
                  >
                    {activeFilterLabel}
                    <ChevronDown />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuGroup>
                      {INVENTORY_VIEW_FILTERS.map((option) => (
                        <DropdownMenuItem
                          key={option.id}
                          onClick={() => setViewFilter(option.id)}
                        >
                          {option.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </InputGroupAddon>
              <InputGroupAddon align="inline-start" className="px-0">
                <div className="h-4 w-px bg-border" aria-hidden />
              </InputGroupAddon>
              <InputGroupAddon align="inline-start">
                <Search aria-hidden />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search and filter..."
                className="border-0"
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Column view"
                  className={INVENTORY_ACCENT.focus}
                >
                  <Columns3 />
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </div>

          <div className="px-2 pt-2">
            <InventoryBulkActionBar
              selectedIds={selectedIds}
              rows={filtered}
              onClearSelection={() => setSelectedIds(new Set())}
            />
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <Ban className="size-12 text-muted-foreground/30" aria-hidden />
              <p className="text-sm text-muted-foreground">
                {isFiltering
                  ? "No inventory rows match your filters on this page."
                  : "No inventory records in this view."}
              </p>
              {isFiltering ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setViewFilter("all");
                  }}
                >
                  Clear filters
                </Button>
              ) : null}
            </div>
          ) : (
            <InventoryDataTable
              rows={filtered}
              selectedIds={selectedIds}
              onSelectedIdsChange={setSelectedIds}
            />
          )}

          <div className="flex items-center justify-between gap-3 border-t px-3 py-2 text-xs text-muted-foreground">
            <span>
              {isFiltering
                ? `${filtered.length} of ${inventory.length} on this page`
                : `Page ${page + 1} · ${total.toLocaleString("en-IN")} matching`}
            </span>
          </div>
        </CardContent>
      </Card>

      {!isFiltering && total > inventory.length ? (
        <Pagination total={total} page={page} basePath="/admin/inventory" />
      ) : null}
    </div>
  );
}
