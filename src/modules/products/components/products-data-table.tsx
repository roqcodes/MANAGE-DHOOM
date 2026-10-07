"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Barcode,
  Copy,
  MoreHorizontal,
  Package,
  Pencil,
  Tag,
  Trash2,
  X,
} from "lucide-react";

import type { ProductWithCategoryListItem } from "@/common/admin/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { CatalogProductTableGlance } from "@/modules/admin/ui";
import { useSortableData } from "@/lib/hooks/use-sortable-data";
import { formatCurrencyAmount } from "@/lib/format-currency";
import {
  bulkDeleteProductsAction,
  bulkSetProductsActiveAction,
  deleteProductAction,
  toggleProductAction,
} from "@/modules/products/actions/products.actions";
import {
  EnabledBadge,
  formatProductPrice,
  formatSkuLabel,
  StockBadge,
} from "@/modules/products/components/products-ui";
import { useAdminAction } from "@/modules/admin/hooks/use-admin-action";

function formatTaxPercent(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(2)}%`;
}

function ProductThumbnail({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);
  const trimmed = url?.trim() ?? "";

  if (!trimmed || failed) {
    return (
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40">
        <Package className="size-4 text-muted-foreground" />
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={trimmed}
      alt=""
      className="size-10 shrink-0 rounded-md border border-border object-cover"
      onError={() => setFailed(true)}
    />
  );
}

export function exportProductsCsv(products: ProductWithCategoryListItem[]) {
  const headers = [
    "Name",
    "Stock",
    "Barcode",
    "Category",
    "Tax%",
    "Purchase Price",
    "Sales Price",
    "Store",
    "Enabled",
    "SKU",
  ];

  const rows = products.map((p) => [
    p.name ?? "",
    String(p.stock_total),
    p.barcode ?? "",
    p.categories?.name ?? "Uncategorized",
    p.tax_rate_percent != null ? String(p.tax_rate_percent) : "",
    p.purchase_price != null ? String(p.purchase_price) : "",
    p.price_min != null ? String(p.price_min) : "",
    p.store_name ?? "",
    p.is_active ? "Yes" : "No",
    formatSkuLabel(p),
  ]);

  const csv = [headers, ...rows]
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
    )
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `inventory-items-export-${format(new Date(), "yyyy-MM-dd")}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function ProductsBulkActionBar({
  selectedIds,
  onClearSelection,
}: {
  selectedIds: Set<string>;
  onClearSelection: () => void;
}) {
  const queryClient = useQueryClient();
  const { runAction, isPending } = useAdminAction();

  if (selectedIds.size === 0) return null;

  const ids = Array.from(selectedIds);

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-accent/50 px-3 py-2 backdrop-blur-sm">
      <p className="text-sm font-medium">
        {selectedIds.size} item{selectedIds.size === 1 ? "" : "s"} selected
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={isPending}
          onClick={() => {
            runAction(async () => {
              await bulkSetProductsActiveAction(ids, true);
              void queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
              onClearSelection();
            });
          }}
        >
          Enable
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => {
            runAction(async () => {
              await bulkSetProductsActiveAction(ids, false);
              void queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
              onClearSelection();
            });
          }}
        >
          Disable
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={isPending}
          onClick={() => {
            runAction(async () => {
              await bulkDeleteProductsAction(ids);
              void queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
              onClearSelection();
            }, { errorTitle: "Couldn't delete items" });
          }}
        >
          <Trash2 data-icon="inline-start" />
          Delete selected
        </Button>
        <Button size="sm" variant="ghost" onClick={onClearSelection}>
          <X data-icon="inline-start" />
          Clear
        </Button>
      </div>
    </div>
  );
}

export function ProductsDataTable({
  products,
  selectedIds,
  onSelectedIdsChange,
  storeName,
  onEdit,
  onUpdateSalesPrice,
}: {
  products: ProductWithCategoryListItem[];
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
  storeName?: string | null;
  onEdit: (product: ProductWithCategoryListItem) => void;
  onUpdateSalesPrice: (product: ProductWithCategoryListItem) => void;
}) {
  const queryClient = useQueryClient();
  const { runAction, isPending } = useAdminAction();

  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    products,
    "name",
    "asc",
    (row, key) => {
      switch (key) {
        case "category_name":
          return row.categories?.name ?? "";
        case "store_name":
          return row.store_name ?? "";
        default:
          return (row as unknown as Record<string, unknown>)[key];
      }
    },
  );

  const pageIds = sorted.map((p) => p.id);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));

  function toggleAllOnPage(checked: boolean) {
    onSelectedIdsChange(
      (() => {
        const next = new Set(selectedIds);
        if (checked) pageIds.forEach((id) => next.add(id));
        else pageIds.forEach((id) => next.delete(id));
        return next;
      })(),
    );
  }

  function toggleRow(id: string, checked: boolean) {
    onSelectedIdsChange(
      (() => {
        const next = new Set(selectedIds);
        if (checked) next.add(id);
        else next.delete(id);
        return next;
      })(),
    );
  }

  function runToggle(productId: string, isActive: boolean) {
    runAction(async () => {
      await toggleProductAction(productId, isActive);
      void queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
    });
  }

  function runDelete(productId: string) {
    runAction(async () => {
      await deleteProductAction(productId);
      void queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
    }, { errorTitle: "Couldn't delete item" });
  }

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <Package className="size-10 text-muted-foreground/40" aria-hidden />
        <p className="text-sm text-muted-foreground">No products in this view.</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-b border-border/60 hover:bg-transparent">
          <TableHead className="w-10">
            <Checkbox
              aria-label="Select all items on this page"
              checked={allPageSelected}
              onCheckedChange={(checked) => toggleAllOnPage(checked === true)}
            />
          </TableHead>
          <SortableTableHead
            label="Name"
            sortKey="name"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
            className="min-w-[200px]"
          />
          <SortableTableHead
            label="Stock"
            sortKey="stock_total"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
          />
          <SortableTableHead
            label="Barcode"
            sortKey="barcode"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
          />
          <SortableTableHead
            label="Category"
            sortKey="category_name"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
          />
          <SortableTableHead
            label="Tax"
            sortKey="tax_rate_percent"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
            align="right"
          />
          <SortableTableHead
            label="Purchase"
            sortKey="purchase_price"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
            align="right"
          />
          <SortableTableHead
            label="Sales"
            sortKey="price_min"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
            align="right"
          />
          <SortableTableHead
            label="Store"
            sortKey="store_name"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
            className="hidden xl:table-cell"
          />
          <SortableTableHead
            label="Enabled"
            sortKey="is_active"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
          />
          <TableHead className="w-24 text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((product) => {
          const isSelected = selectedIds.has(product.id);
          const displayStore = product.store_name ?? storeName ?? "—";

          return (
            <TableRow
              key={product.id}
              data-state={isSelected ? "selected" : undefined}
              className="border-b border-border/60 hover:bg-muted/40 data-[state=selected]:bg-accent/60"
            >
              <TableCell>
                <Checkbox
                  aria-label={`Select ${product.name ?? "item"}`}
                  checked={isSelected}
                  onCheckedChange={(checked) =>
                    toggleRow(product.id, checked === true)
                  }
                />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  <ProductThumbnail url={product.image_url} />
                  <div className="min-w-0 flex-1">
                    <CatalogProductTableGlance product={product} storeName={storeName} />
                    <p className="truncate text-[11px] text-muted-foreground">
                      {product.product_code
                        ? `Code: ${product.product_code}`
                        : formatSkuLabel(product)}
                    </p>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <StockBadge stock={product.stock_total} />
              </TableCell>
              <TableCell className="font-mono text-[12px] text-muted-foreground">
                {product.barcode ?? "—"}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {product.categories?.name ?? "Uncategorized"}
              </TableCell>
              <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                {formatTaxPercent(product.tax_rate_percent)}
              </TableCell>
              <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                {product.purchase_price != null
                  ? formatCurrencyAmount(product.purchase_price)
                  : "—"}
              </TableCell>
              <TableCell className="text-right text-sm font-semibold tabular-nums">
                {formatProductPrice(product.price_min)}
              </TableCell>
              <TableCell className="hidden max-w-[120px] truncate text-sm text-muted-foreground xl:table-cell">
                {displayStore}
              </TableCell>
              <TableCell>
                <EnabledBadge enabled={product.is_active === true} />
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() => onEdit(product)}
                  >
                    <Pencil data-icon="inline-start" />
                    Edit
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label="More actions"
                        />
                      }
                    >
                      <MoreHorizontal />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          nativeButton={false}
                          render={<Link href={`/admin/products/${product.id}`} />}
                        >
                          <Copy />
                          View detail
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onUpdateSalesPrice(product)}>
                          <Tag />
                          Update sales price
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onEdit(product)}>
                          <Pencil />
                          Edit item
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled title="Coming soon">
                          <Barcode />
                          Print barcode
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={isPending}
                          onClick={() =>
                            runToggle(product.id, product.is_active !== true)
                          }
                        >
                          <Archive />
                          {product.is_active ? "Disable" : "Enable"}
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          variant="destructive"
                          disabled={isPending}
                          onClick={() => runDelete(product.id)}
                        >
                          <Trash2 />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
