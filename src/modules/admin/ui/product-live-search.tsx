"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Search } from "lucide-react";

import type { ErpProductSearchRow } from "@/common/erp/purchasing-types";
import type { ErpSalesProductSearchRow } from "@/common/erp/sales-types";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useSearchListKeyboard } from "@/modules/admin/ui/use-search-list-keyboard";
import {
  ERP_PRODUCT_SEARCH_GC_MS,
  ERP_PRODUCT_SEARCH_STALE_MS,
  erpProductLiveSearchQueryKey,
  fetchErpProductLiveSearch,
} from "@/modules/erp/lib/erp-product-live-search.client";

export type ProductCatalogType = "sales" | "purchase";
export type ProductLiveSearchRow = ErpProductSearchRow | ErpSalesProductSearchRow;

type ProductLiveSearchProps = {
  catalog: ProductCatalogType;
  storeId?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  minChars?: number;
  onSelect?: (row: ProductLiveSearchRow) => void;
  renderResult?: (row: ProductLiveSearchRow, dismiss: () => void) => ReactNode;
  /** Purchase catalog only — show inline create affordance. */
  allowCreate?: boolean;
  onCreateRequest?: (query: string) => void;
};

function isSalesRow(row: ProductLiveSearchRow): row is ErpSalesProductSearchRow {
  return "available_stock" in row;
}

export function ProductLiveSearch({
  catalog,
  storeId,
  disabled,
  placeholder = "Search product by name or barcode…",
  className,
  minChars = 1,
  onSelect,
  renderResult,
  allowCreate = false,
  onCreateRequest,
}: ProductLiveSearchProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const customRowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const trimmedQuery = query.trim();
  const searchEnabled = open && !disabled && trimmedQuery.length >= minChars;

  const staleTime = ERP_PRODUCT_SEARCH_STALE_MS;

  const {
    data: results = [],
    error: queryError,
    isFetching,
    isPending,
  } = useQuery({
    queryKey: erpProductLiveSearchQueryKey(catalog, storeId, trimmedQuery),
    queryFn: () =>
      fetchErpProductLiveSearch(catalog, trimmedQuery, storeId) as Promise<
        ProductLiveSearchRow[]
      >,
    enabled: searchEnabled,
    staleTime,
    gcTime: ERP_PRODUCT_SEARCH_GC_MS,
    placeholderData: keepPreviousData,
  });

  const fetchError = queryError instanceof Error ? queryError.message : null;
  const showInitialLoading = searchEnabled && isPending && results.length === 0;
  const showBackgroundFetch = searchEnabled && isFetching && !showInitialLoading;

  function dismiss() {
    setQuery("");
    setOpen(false);
  }

  function handleSelect(row: ProductLiveSearchRow) {
    onSelect?.(row);
    dismiss();
  }

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const canCreate = allowCreate && Boolean(onCreateRequest) && catalog === "purchase";
  const showDropdown =
    open &&
    !disabled &&
    (showInitialLoading ||
      showBackgroundFetch ||
      results.length > 0 ||
      trimmedQuery.length >= minChars ||
      Boolean(fetchError) ||
      canCreate);

  function requestCreate() {
    onCreateRequest?.(query.trim());
    dismiss();
  }

  const keyboardItemCount = useMemo(() => {
    if (!showDropdown || showInitialLoading) return 0;
    if (trimmedQuery.length < minChars) return canCreate ? 1 : 0;
    if (results.length === 0) return canCreate ? 1 : 0;
    return results.length + (canCreate ? 1 : 0);
  }, [
    canCreate,
    minChars,
    results.length,
    showDropdown,
    showInitialLoading,
    trimmedQuery.length,
  ]);

  const closeDropdown = useCallback(() => {
    setOpen(false);
  }, []);

  const activateKeyboardIndex = useCallback(
    (index: number) => {
      if (index < results.length) {
        if (renderResult) {
          const rowEl = customRowRefs.current[index];
          const firstButton = rowEl?.querySelector("button");
          if (firstButton instanceof HTMLButtonElement) {
            firstButton.click();
          }
          return;
        }
        handleSelect(results[index]);
        return;
      }
      if (canCreate) requestCreate();
    },
    [canCreate, renderResult, results],
  );

  const { activeIndex, setActiveIndex, registerItemRef, handleKeyDown } =
    useSearchListKeyboard({
      open: showDropdown,
      itemCount: keyboardItemCount,
      onSelectIndex: activateKeyboardIndex,
      onClose: closeDropdown,
    });

  return (
    <div
      ref={rootRef}
      data-enter-nav={open ? "off" : undefined}
      className={cn("relative w-full", className)}
    >
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          disabled={disabled}
          autoComplete="off"
          placeholder={placeholder}
          className="h-10 pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
          }
          onKeyDown={handleKeyDown}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
        />
        {showInitialLoading || showBackgroundFetch ? (
          <Loader2 className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      {showDropdown ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Product search results"
          className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md"
        >
          {showInitialLoading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Searching…
            </div>
          ) : fetchError ? (
            <p className="px-3 py-6 text-center text-xs text-destructive">{fetchError}</p>
          ) : trimmedQuery.length < minChars ? (
            canCreate ? (
              <button
                id={`${listboxId}-option-0`}
                type="button"
                role="option"
                aria-selected={activeIndex === 0}
                ref={(el) => registerItemRef(0, el)}
                onMouseEnter={() => setActiveIndex(0)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={requestCreate}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-2.5 text-left text-sm font-medium text-primary transition hover:bg-muted",
                  activeIndex === 0 && "bg-muted ring-1 ring-ring",
                )}
              >
                <Plus className="size-4 shrink-0" />
                Create new product
              </button>
            ) : (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                Type to search products
              </p>
            )
          ) : results.length === 0 ? (
            canCreate ? (
              <div className="py-1">
                <p className="px-3 py-2 text-center text-xs text-muted-foreground">
                  No products found for &ldquo;{trimmedQuery}&rdquo;
                </p>
                <button
                  id={`${listboxId}-option-0`}
                  type="button"
                  role="option"
                  aria-selected={activeIndex === 0}
                  ref={(el) => registerItemRef(0, el)}
                  onMouseEnter={() => setActiveIndex(0)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={requestCreate}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2.5 py-2.5 text-left text-sm font-medium text-primary transition hover:bg-muted",
                    activeIndex === 0 && "bg-muted ring-1 ring-ring",
                  )}
                >
                  <Plus className="size-4 shrink-0" />
                  Create &ldquo;{trimmedQuery}&rdquo;
                </button>
              </div>
            ) : (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">No products found</p>
            )
          ) : renderResult ? (
            results.map((row, index) => (
              <div
                key={row.id}
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={activeIndex === index}
                ref={(el) => {
                  customRowRefs.current[index] = el;
                  registerItemRef(index, el);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  "rounded-md px-1 py-0.5",
                  activeIndex === index && "bg-muted ring-1 ring-ring",
                )}
              >
                {renderResult(row, () => handleSelect(row))}
              </div>
            ))
          ) : (
            results.map((row, index) => (
              <button
                key={row.id}
                id={`${listboxId}-option-${index}`}
                type="button"
                role="option"
                aria-selected={activeIndex === index}
                ref={(el) => registerItemRef(index, el)}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(row)}
                className={cn(
                  "flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left text-sm transition hover:bg-muted",
                  activeIndex === index && "bg-muted ring-1 ring-ring",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {row.product_name}
                  </p>
                  {row.barcode ? (
                    <p className="truncate text-xs text-muted-foreground">Barcode: {row.barcode}</p>
                  ) : null}
                </div>
                {isSalesRow(row) ? (
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    Stock: {row.available_stock}
                  </span>
                ) : null}
              </button>
            ))
          )}
          {canCreate && results.length > 0 ? (
            <div className="mt-1 border-t border-border pt-1">
              <button
                id={`${listboxId}-option-${results.length}`}
                type="button"
                role="option"
                aria-selected={activeIndex === results.length}
                ref={(el) => registerItemRef(results.length, el)}
                onMouseEnter={() => setActiveIndex(results.length)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={requestCreate}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-medium text-primary transition hover:bg-muted",
                  activeIndex === results.length && "bg-muted ring-1 ring-ring",
                )}
              >
                <Plus className="size-3.5 shrink-0" />
                {trimmedQuery ? `Create "${trimmedQuery}"` : "Create new product"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
