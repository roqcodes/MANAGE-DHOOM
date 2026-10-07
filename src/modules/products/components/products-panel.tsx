"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { Ban, ChevronDown, Search } from "lucide-react";

import type {
  Brand,
  Category,
  ProductCatalogStats,
  ProductWithCategoryListItem,
} from "@/common/admin/types";
import { formatCategoryOptionLabel } from "@/modules/products/lib/categories.utils";
import { Pagination } from "@/modules/admin/components/pagination";
import { ProductManageModal } from "@/modules/products/components/product-manage-modal";
import {
  exportProductsCsv,
  ProductsBulkActionBar,
  ProductsDataTable,
} from "@/modules/products/components/products-data-table";
import { ProductsMetricsBar } from "@/modules/products/components/products-metrics-bar";
import {
  ALL_CATEGORIES,
  matchesProductStatusFilter,
  PRODUCT_STATUS_FILTERS,
  UNCATEGORIZED,
  type ProductStatusFilter,
} from "@/modules/products/components/products-ui";
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
import { useErpStores } from "@/modules/erp/components/use-erp-stores";
import { CsvImportDialog } from "@/modules/erp/components/csv-import-dialog";

type ManageModalState =
  | { mode: "create" }
  | { mode: "edit"; product: ProductWithCategoryListItem; focusPricing?: boolean }
  | null;

export function ProductsPanel({
  products,
  categories,
  brands,
  total,
  page,
  stats,
  storeId: storeIdProp,
}: {
  products: ProductWithCategoryListItem[];
  categories: Category[];
  brands: Brand[];
  total: number;
  page: number;
  stats: ProductCatalogStats;
  storeId?: string | null;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { stores, activeStoreId } = useErpStores();
  const [modal, setModal] = useState<ManageModalState>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProductStatusFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [localStoreId, setLocalStoreId] = useState(storeIdProp ?? "");

  useEffect(() => {
    if (activeStoreId && !localStoreId && !storeIdProp) {
      setLocalStoreId(activeStoreId);
    }
  }, [activeStoreId, localStoreId, storeIdProp]);

  const activeStoreIdResolved = storeIdProp ?? localStoreId;
  const activeStoreName =
    products[0]?.store_name ??
    stores.find((s) => s.id === activeStoreIdResolved)?.name ??
    null;

  const activeCategoryId = searchParams.get("category_id") || ALL_CATEGORIES;

  useEffect(() => {
    if (searchParams.get("form") === "new") {
      setModal({ mode: "create" });
    }
  }, [searchParams]);

  function handleCategoryChange(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", "0");
    if (id === ALL_CATEGORIES) params.delete("category_id");
    else params.set("category_id", id);
    router.push(`?${params.toString()}`);
  }

  function handleStoreChange(id: string) {
    setLocalStoreId(id);
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", "0");
    if (id) params.set("storeId", id);
    else params.delete("storeId");
    router.push(`?${params.toString()}`);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return products.filter((p) => {
      if (!matchesProductStatusFilter(p, statusFilter)) return false;
      if (!q) return true;

      const name = (p.name ?? "").toLowerCase();
      const desc = (p.description ?? "").toLowerCase();
      const cat = (p.categories?.name ?? "").toLowerCase();
      const sku = (p.sku_label ?? "").toLowerCase();
      const barcode = (p.barcode ?? "").toLowerCase();
      const code = (p.product_code ?? "").toLowerCase();
      const idShort = p.id.slice(0, 8).toLowerCase();
      return (
        name.includes(q) ||
        desc.includes(q) ||
        cat.includes(q) ||
        sku.includes(q) ||
        barcode.includes(q) ||
        code.includes(q) ||
        idShort.includes(q)
      );
    });
  }, [products, search, statusFilter]);

  const isFiltering =
    search.trim().length > 0 ||
    statusFilter !== "all" ||
    activeCategoryId !== ALL_CATEGORIES ||
    Boolean(activeStoreIdResolved);

  const listParams: Record<string, string> = {};
  if (activeCategoryId !== ALL_CATEGORIES) {
    listParams.category_id = activeCategoryId;
  }
  if (activeStoreIdResolved) {
    listParams.storeId = activeStoreIdResolved;
  }

  const activeStatusLabel =
    PRODUCT_STATUS_FILTERS.find((f) => f.id === statusFilter)?.label ??
    "All Statuses";

  const categoryFilterLabel =
    activeCategoryId === ALL_CATEGORIES
      ? "All categories"
      : activeCategoryId === UNCATEGORIZED
        ? "Uncategorized"
        : (categories.find((c) => c.id === activeCategoryId)?.name ??
          "All categories");

  const storeFilterLabel =
    stores.find((s) => s.id === activeStoreIdResolved)?.name ?? "All stores";

  return (
    <>
      <AnimatePresence>
        {modal ? (
          <ProductManageModal
            key={modal.mode === "create" ? "create" : modal.product.id}
            mode={modal.mode}
            product={modal.mode === "edit" ? modal.product : undefined}
            categories={categories}
            brands={brands}
            initialStepId={modal.mode === "edit" && modal.focusPricing ? "variants" : "details"}
            onClose={() => {
              setModal(null);
              if (searchParams.get("form")) {
                const params = new URLSearchParams(searchParams.toString());
                params.delete("form");
                const qs = params.toString();
                router.replace(qs ? `?${qs}` : "/admin/products");
              }
              void queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
            }}
          />
        ) : null}
      </AnimatePresence>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-3 sm:px-4 sm:py-4">
        <ProductsMetricsBar
          stats={stats}
          onExport={() => exportProductsCsv(filtered)}
          onImport={() => setImportOpen(true)}
          onCreate={() => setModal({ mode: "create" })}
        />
        <CsvImportDialog
          entity="products"
          open={importOpen}
          onOpenChange={setImportOpen}
          storeId={activeStoreIdResolved || undefined}
          onSuccess={() => void queryClient.invalidateQueries({ queryKey: ["admin", "products"] })}
        />

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
                          className="gap-1 px-2"
                        />
                      }
                    >
                      {activeStatusLabel}
                      <ChevronDown />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuGroup>
                        {PRODUCT_STATUS_FILTERS.map((option) => (
                          <DropdownMenuItem
                            key={option.id}
                            onClick={() => setStatusFilter(option.id)}
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
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <InputGroupButton
                          variant="ghost"
                          size="sm"
                          className="gap-1 px-2"
                        />
                      }
                    >
                      {categoryFilterLabel}
                      <ChevronDown />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto">
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          onClick={() => handleCategoryChange(ALL_CATEGORIES)}
                        >
                          All categories
                        </DropdownMenuItem>
                        {categories.map((category) => (
                          <DropdownMenuItem
                            key={category.id}
                            onClick={() => handleCategoryChange(category.id)}
                          >
                            {formatCategoryOptionLabel(category, categories)}
                          </DropdownMenuItem>
                        ))}
                        {stats.uncategorized > 0 ? (
                          <DropdownMenuItem
                            onClick={() => handleCategoryChange(UNCATEGORIZED)}
                          >
                            Uncategorized
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </InputGroupAddon>
                {stores.length > 0 ? (
                  <>
                    <InputGroupAddon align="inline-start" className="px-0">
                      <div className="h-4 w-px bg-border" aria-hidden />
                    </InputGroupAddon>
                    <InputGroupAddon align="inline-start">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <InputGroupButton
                              variant="ghost"
                              size="sm"
                              className="max-w-[140px] gap-1 truncate px-2"
                            />
                          }
                        >
                          <span className="truncate">{storeFilterLabel}</span>
                          <ChevronDown />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto">
                          <DropdownMenuGroup>
                            <DropdownMenuItem onClick={() => handleStoreChange("")}>
                              All stores
                            </DropdownMenuItem>
                            {stores.map((store) => (
                              <DropdownMenuItem
                                key={store.id}
                                onClick={() => handleStoreChange(store.id)}
                              >
                                {store.name}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </InputGroupAddon>
                  </>
                ) : null}
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
                  placeholder="Search name, barcode, category…"
                />
              </InputGroup>
            </div>

            {activeStoreName ? (
              <div className="border-b bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
                Showing stock for{" "}
                <span className="font-medium text-foreground">{activeStoreName}</span>
              </div>
            ) : null}

            <div className="px-2 pt-2">
              <ProductsBulkActionBar
                selectedIds={selectedIds}
                onClearSelection={() => setSelectedIds(new Set())}
              />
            </div>

            {filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <Ban className="size-12 text-muted-foreground/30" aria-hidden />
                <p className="text-sm text-muted-foreground">
                  {isFiltering
                    ? "No items match your filters on this page."
                    : "No items yet."}
                </p>
                {isFiltering ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearch("");
                      setStatusFilter("all");
                      handleCategoryChange(ALL_CATEGORIES);
                      handleStoreChange("");
                    }}
                  >
                    Clear filters
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setModal({ mode: "create" })}>
                    Add your first item
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <ProductsDataTable
                  products={filtered}
                  selectedIds={selectedIds}
                  onSelectedIdsChange={setSelectedIds}
                  storeName={activeStoreName}
                  onEdit={(product) => setModal({ mode: "edit", product })}
                  onUpdateSalesPrice={(product) =>
                    setModal({ mode: "edit", product, focusPricing: true })
                  }
                />
              </div>
            )}

            <div className="flex items-center justify-between gap-3 border-t px-3 py-2 text-xs text-muted-foreground">
              <span>
                {isFiltering
                  ? `${filtered.length} of ${products.length} on this page`
                  : `${Math.min(products.length, total)} of ${total.toLocaleString("en-IN")} items`}
              </span>
            </div>

            {!isFiltering && total > products.length ? (
              <Pagination
                total={total}
                page={page}
                basePath="/admin/products"
                extraParams={listParams}
              />
            ) : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
