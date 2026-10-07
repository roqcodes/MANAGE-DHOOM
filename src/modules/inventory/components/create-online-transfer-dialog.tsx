"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRightLeft,
  ChevronLeft,
  ChevronRight,
  Loader2,
  PackagePlus,
  Search,
  Trash2,
} from "lucide-react";

import type { ErpSalesProductSearchRow } from "@/common/erp/sales-types";
import { AdminTableBodySkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { adminGet, adminPost } from "@/modules/admin/lib/admin-api-client";
import { useDebouncedValue } from "@/modules/admin/ui/use-debounced-value";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { cn } from "@/lib/utils";

type StockFilter = "in_stock" | "all" | "out_of_stock";
type SortKey = "name" | "stock_desc" | "stock_asc";

type TransferLine = {
  productId: string;
  productName: string;
  barcode: string | null;
  availableStock: number;
  quantity: number;
};

const PAGE_SIZE = 50;

const selectCls =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function CreateOnlineTransferDialog({
  open,
  onOpenChange,
  storeId,
  storeLabel,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string | null;
  storeLabel: string;
  onSuccess?: () => void;
}) {
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("in_stock");
  const [sort, setSort] = useState<SortKey>("stock_desc");
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lines, setLines] = useState<TransferLine[]>([]);
  const [bulkQty, setBulkQty] = useState(1);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [partialErrors, setPartialErrors] = useState<string[]>([]);

  const debouncedSearch = useDebouncedValue(search, 250);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setStockFilter("in_stock");
    setSort("stock_desc");
    setPage(0);
    setSelectedIds(new Set());
    setLines([]);
    setBulkQty(1);
    setNotes("");
    setError(null);
    setPartialErrors([]);
  }, [open]);

  useEffect(() => {
    setPage(0);
    setSelectedIds(new Set());
  }, [debouncedSearch, stockFilter, sort]);

  const catalogQuery = useQuery({
    queryKey: [
      "admin",
      "transfer-catalog",
      storeId,
      debouncedSearch,
      stockFilter,
      sort,
      page,
    ],
    queryFn: () => {
      const params = new URLSearchParams({
        mode: "transfer",
        q: debouncedSearch,
        stockFilter,
        sort,
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (storeId) params.set("storeId", storeId);
      return adminGet<{ data: ErpSalesProductSearchRow[]; total: number }>(
        `erp/sales-catalog?${params.toString()}`,
      );
    },
    enabled: open && Boolean(storeId),
  });

  const catalog = catalogQuery.data?.data ?? [];
  const catalogTotal = catalogQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(catalogTotal / PAGE_SIZE));

  const lineMap = useMemo(
    () => new Map(lines.map((line) => [line.productId, line])),
    [lines],
  );

  const totals = useMemo(() => {
    let units = 0;
    for (const line of lines) {
      units += line.quantity;
    }
    return { products: lines.length, units };
  }, [lines]);

  const allPageSelected =
    catalog.length > 0 && catalog.every((row) => selectedIds.has(row.id));

  function togglePageSelect(checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const row of catalog) {
        if (checked) next.add(row.id);
        else next.delete(row.id);
      }
      return next;
    });
  }

  function toggleRow(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function addProducts(
    rows: ErpSalesProductSearchRow[],
    qty?: number | "max",
  ) {
    if (rows.length === 0) return;
    setLines((prev) => {
      const next = [...prev];
      const indexById = new Map(next.map((line, idx) => [line.productId, idx]));

      for (const row of rows) {
        const available = Math.max(0, Math.floor(row.available_stock));
        if (available <= 0 && stockFilter !== "all") continue;

        const quantity =
          qty === "max"
            ? available
            : Math.max(1, Math.floor(qty ?? bulkQty));

        if (quantity <= 0) continue;

        const cappedQty = Math.min(quantity, available > 0 ? available : quantity);
        const existingIdx = indexById.get(row.id);

        if (existingIdx != null) {
          next[existingIdx] = {
            ...next[existingIdx],
            quantity: cappedQty,
            availableStock: available,
          };
        } else {
          next.push({
            productId: row.id,
            productName: row.product_name,
            barcode: row.barcode,
            availableStock: available,
            quantity: cappedQty,
          });
        }
      }

      return next;
    });
  }

  function addSelected() {
    const rows = catalog.filter((row) => selectedIds.has(row.id));
    addProducts(rows);
    setSelectedIds(new Set());
  }

  function addRow(row: ErpSalesProductSearchRow) {
    addProducts([row]);
  }

  function removeLine(productId: string) {
    setLines((prev) => prev.filter((line) => line.productId !== productId));
  }

  function updateLineQty(productId: string, quantity: number) {
    setLines((prev) =>
      prev.map((line) => {
        if (line.productId !== productId) return line;
        const max = line.availableStock > 0 ? line.availableStock : quantity;
        return {
          ...line,
          quantity: Math.max(1, Math.min(Math.floor(quantity), max)),
        };
      }),
    );
  }

  function applyBulkQtyToLines() {
    const qty = Math.max(1, Math.floor(bulkQty));
    setLines((prev) =>
      prev.map((line) => ({
        ...line,
        quantity: Math.min(
          qty,
          line.availableStock > 0 ? line.availableStock : qty,
        ),
      })),
    );
  }

  function fillMaxOnLines() {
    setLines((prev) =>
      prev.map((line) => ({
        ...line,
        quantity: Math.max(1, line.availableStock),
      })),
    );
  }

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["admin", "online-stock-transfers"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "online-to-physical"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "inventory"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "transfer-catalog"] });
  }

  function submit() {
    if (!storeId || lines.length === 0) return;
    setError(null);
    setPartialErrors([]);

    const invalid = lines.filter(
      (line) =>
        line.quantity <= 0 ||
        (line.availableStock > 0 && line.quantity > line.availableStock),
    );
    if (invalid.length > 0) {
      setError("One or more lines exceed available physical stock.");
      return;
    }

    startTransition(async () => {
      try {
        const result = await adminPost<{
          created: string[];
          failed: { productId: string; message: string }[];
        }>("inventory/online-transfers", {
          storeId,
          notes: notes.trim() || null,
          lines: lines.map((line) => ({
            productId: line.productId,
            quantity: Math.floor(line.quantity),
          })),
        });

        refresh();

        if (result.failed?.length) {
          const names = result.failed.map((f) => {
            const name = lines.find((l) => l.productId === f.productId)?.productName;
            return `${name ?? f.productId}: ${f.message}`;
          });
          setPartialErrors(names);
          setError("Transfer batch failed. No stock was moved.");
        }

        if (result.created?.length > 0) {
          onSuccess?.();
          if (!result.failed?.length) {
            onOpenChange(false);
          }
        } else {
          setError("No transfers were created. Check quantities and stock.");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Transfer failed");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "!flex max-h-[min(94vh,960px)] w-[calc(100%-1.5rem)] max-w-[min(96vw,1280px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,1280px)]",
        )}
      >
        <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <ArrowRightLeft className="size-5" />
            Store → Online transfer
          </DialogTitle>
          <DialogDescription>
            Move physical stock from <strong>{storeLabel}</strong> into the online
            pool. Select multiple products, set quantities, then create transfers.
            Allocate variants from the <strong>Pending</strong> tab afterward.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-12 lg:min-h-[min(58vh,620px)]">
          {/* Catalog browser */}
          <div className="flex min-h-0 flex-col border-b lg:col-span-7 lg:border-b-0 lg:border-r">
            <div className="shrink-0 space-y-3 border-b p-4">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name or barcode…"
                  className="h-9 pl-9"
                  disabled={!storeId}
                />
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div>
                  <Label className="mb-1 block text-[11px] text-muted-foreground">
                    Stock filter
                  </Label>
                  <select
                    className={selectCls}
                    value={stockFilter}
                    onChange={(e) => setStockFilter(e.target.value as StockFilter)}
                  >
                    <option value="in_stock">Has physical stock</option>
                    <option value="all">All products</option>
                    <option value="out_of_stock">Zero physical stock</option>
                  </select>
                </div>
                <div>
                  <Label className="mb-1 block text-[11px] text-muted-foreground">
                    Sort by
                  </Label>
                  <select
                    className={selectCls}
                    value={sort}
                    onChange={(e) => setSort(e.target.value as SortKey)}
                  >
                    <option value="stock_desc">Stock (high → low)</option>
                    <option value="stock_asc">Stock (low → high)</option>
                    <option value="name">Name (A → Z)</option>
                  </select>
                </div>
                <div>
                  <Label className="mb-1 block text-[11px] text-muted-foreground">
                    Default qty
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    className="h-8"
                    value={bulkQty}
                    onChange={(e) =>
                      setBulkQty(Math.max(1, Number(e.target.value) || 1))
                    }
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-full"
                    disabled={selectedIds.size === 0}
                    onClick={addSelected}
                  >
                    <PackagePlus data-icon="inline-start" />
                    Add selected ({selectedIds.size})
                  </Button>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              {catalogQuery.isPending ? (
                <div className="px-4 py-6">
                  <AdminTableBodySkeleton rows={8} />
                </div>
              ) : catalog.length === 0 ? (
                <p className="px-4 py-16 text-center text-sm text-muted-foreground">
                  No products match your filters.
                </p>
              ) : (
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allPageSelected}
                          onCheckedChange={(checked) =>
                            togglePageSelect(checked === true)
                          }
                          aria-label="Select all on page"
                        />
                      </TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="hidden sm:table-cell">Barcode</TableHead>
                      <TableHead className="text-right">Physical</TableHead>
                      <TableHead className="hidden text-right md:table-cell">
                        Price
                      </TableHead>
                      <TableHead className="w-20" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {catalog.map((row) => {
                      const inQueue = lineMap.has(row.id);
                      return (
                        <TableRow
                          key={row.id}
                          className={cn(inQueue && "bg-primary/5")}
                        >
                          <TableCell>
                            <Checkbox
                              checked={selectedIds.has(row.id)}
                              onCheckedChange={(checked) =>
                                toggleRow(row.id, checked === true)
                              }
                              aria-label={`Select ${row.product_name}`}
                            />
                          </TableCell>
                          <TableCell className="max-w-[180px]">
                            <p className="truncate font-medium text-sm">
                              {row.product_name}
                            </p>
                            {inQueue ? (
                              <p className="text-[11px] text-primary">In queue</p>
                            ) : null}
                          </TableCell>
                          <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
                            {row.barcode ?? "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.available_stock}
                          </TableCell>
                          <TableCell className="hidden text-right text-xs tabular-nums md:table-cell">
                            {formatCurrencyAmount(row.sales_price ?? 0)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2"
                              onClick={() => addRow(row)}
                              disabled={row.available_stock <= 0}
                            >
                              Add
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
              <span>
                {catalogTotal.toLocaleString("en-IN")} products · Page {page + 1} of{" "}
                {pageCount}
              </span>
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  disabled={page <= 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  disabled={page + 1 >= pageCount}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>
          </div>

          {/* Transfer queue */}
          <div className="flex min-h-0 flex-col lg:col-span-5">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
              <div>
                <p className="text-sm font-semibold">Transfer queue</p>
                <p className="text-xs text-muted-foreground">
                  {totals.products} product{totals.products === 1 ? "" : "s"} ·{" "}
                  {totals.units} units
                </p>
              </div>
              {lines.length > 0 ? (
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={applyBulkQtyToLines}
                  >
                    Apply qty {bulkQty}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={fillMaxOnLines}
                  >
                    Fill max
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {lines.length === 0 ? (
                <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted-foreground">
                  <PackagePlus className="size-8 opacity-30" />
                  <p>Select products from the catalog or use multi-select + Add selected.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="w-14 text-right">Avail.</TableHead>
                      <TableHead className="w-24">Qty</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line) => (
                      <TableRow key={line.productId}>
                        <TableCell className="min-w-[160px] max-w-[220px]">
                          <p className="line-clamp-2 text-sm font-medium leading-snug">
                            {line.productName}
                          </p>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {line.availableStock}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={1}
                            max={line.availableStock > 0 ? line.availableStock : undefined}
                            className="h-8 w-full tabular-nums"
                            value={line.quantity}
                            onChange={(e) =>
                              updateLineQty(
                                line.productId,
                                Number(e.target.value) || 1,
                              )
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => removeLine(line.productId)}
                          >
                            <Trash2 />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            <div className="shrink-0 border-t bg-muted/20 p-4">
              <Label className="mb-1.5 block text-xs">Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="resize-none"
                placeholder="Batch reference for audit trail"
              />
            </div>
          </div>
        </div>

        {(error || partialErrors.length > 0) && (
          <div className="shrink-0 space-y-2 border-t bg-destructive/5 px-5 py-3">
            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : null}
            {partialErrors.map((msg) => (
              <p key={msg} className="text-xs text-destructive">{msg}</p>
            ))}
          </div>
        )}

        <div className="flex shrink-0 flex-col-reverse gap-3 border-t bg-muted/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {totals.products > 0
              ? `Creating ${totals.products} transfer${totals.products === 1 ? "" : "s"} (${totals.units} units total)`
              : "Add products to the queue to continue"}
          </p>
          <div className="flex shrink-0 justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={pending || !storeId || lines.length === 0}
            >
              {pending
                ? "Creating transfers…"
                : totals.products > 0
                  ? `Create ${totals.products} transfer${totals.products === 1 ? "" : "s"}`
                  : "Create transfers"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
