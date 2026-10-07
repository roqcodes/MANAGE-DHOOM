"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Loader2, Search, X } from "lucide-react";

import { useDebouncedValue } from "@/modules/admin/ui/use-debounced-value";
import {
  ENTITY_DOCUMENT_SEARCH_STALE_MS,
  ENTITY_PARTY_SEARCH_STALE_MS,
  ENTITY_SEARCH_DEBOUNCE_MS,
  ENTITY_SEARCH_GC_MS,
  entityLiveSearchQueryKey,
  fetchCustomerSearchOptions,
  fetchVendorSearchOptions,
  resolveCustomerPickerOption,
  resolveVendorPickerOption,
  type EntitySearchOption,
} from "@/modules/erp/lib/entity-live-search.client";
import type { ErpSalesProductSearchRow } from "@/common/erp/sales-types";
import {
  ERP_PRODUCT_SEARCH_GC_MS,
  ERP_PRODUCT_SEARCH_STALE_MS,
} from "@/modules/erp/lib/erp-product-live-search.client";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { useSearchListKeyboard } from "@/modules/admin/ui/use-search-list-keyboard";

export type { EntitySearchOption } from "@/modules/erp/lib/entity-live-search.client";

type EntitySearchSelectProps = {
  value: string | null;
  onChange: (id: string | null, option?: EntitySearchOption) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  fetchOptions: (query: string) => Promise<EntitySearchOption[]>;
  /** TanStack Query cache scope (e.g. `vendor`, `customer`, `invoice`). */
  cacheScope: string;
  staleTime?: number;
  gcTime?: number;
  /** Resolve authoritative option on select (search rows are suggestions only). */
  resolveSelectedOption?: (id: string) => Promise<EntitySearchOption>;
  selectedLabel?: string;
  minChars?: number;
  loadOnFocus?: boolean;
};

export function EntitySearchSelect({
  value,
  onChange,
  placeholder = "Search and select…",
  searchPlaceholder = "Type to search…",
  emptyText = "No results",
  disabled,
  className,
  fetchOptions,
  cacheScope,
  staleTime = ENTITY_PARTY_SEARCH_STALE_MS,
  gcTime = ENTITY_SEARCH_GC_MS,
  resolveSelectedOption,
  selectedLabel,
  minChars = 1,
  loadOnFocus = true,
}: EntitySearchSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fetchOptionsRef = useRef(fetchOptions);
  fetchOptionsRef.current = fetchOptions;
  const resolveSelectedRef = useRef(resolveSelectedOption);
  resolveSelectedRef.current = resolveSelectedOption;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [menuStyle, setMenuStyle] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const debouncedQuery = useDebouncedValue(query, ENTITY_SEARCH_DEBOUNCE_MS);
  const listboxId = useId();

  const trimmedDebounced = debouncedQuery.trim();
  const searchQuery =
    loadOnFocus || trimmedDebounced.length >= minChars ? trimmedDebounced : "";
  const queryEnabled =
    open &&
    !disabled &&
    (loadOnFocus || trimmedDebounced.length >= minChars);

  const {
    data: options = [],
    error: queryError,
    isFetching,
    isPending,
  } = useQuery({
    queryKey: entityLiveSearchQueryKey(cacheScope, searchQuery),
    queryFn: () => fetchOptionsRef.current(searchQuery),
    enabled: queryEnabled,
    staleTime,
    gcTime,
    placeholderData: keepPreviousData,
  });

  const loading = queryEnabled && isPending && options.length === 0;
  const showBackgroundFetch = queryEnabled && isFetching && !loading;

  useEffect(() => {
    if (queryError instanceof Error) {
      setFetchError(queryError.message);
    } else {
      setFetchError(null);
    }
  }, [queryError]);

  const selectableCount =
    open &&
    !loading &&
    !(trimmedDebounced.length < minChars && !loadOnFocus) &&
    options.length > 0
      ? options.length
      : 0;

  const selectOptionAt = useCallback(
    (index: number) => {
      const option = options[index];
      if (!option) return;

      const commit = (resolved: EntitySearchOption) => {
        onChange(resolved.id, resolved);
        setOpen(false);
        setQuery("");
      };

      const resolver = resolveSelectedRef.current;
      if (resolver) {
        void resolver(option.id)
          .then(commit)
          .catch((err: unknown) => {
            setFetchError(err instanceof Error ? err.message : "Could not load selection");
          });
        return;
      }

      commit(option);
    },
    [onChange, options],
  );

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  const { activeIndex, setActiveIndex, registerItemRef, handleKeyDown } =
    useSearchListKeyboard({
      open,
      itemCount: selectableCount,
      onSelectIndex: selectOptionAt,
      onClose: closeDropdown,
    });

  const updateMenuPosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    setMenuStyle({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  const displayValue = useMemo(() => {
    if (open) return query;
    if (selectedLabel) return selectedLabel;
    const match = options.find((o) => o.id === value);
    return match?.label ?? "";
  }, [open, query, selectedLabel, options, value]);

  useEffect(() => {
    if (!open) {
      setMenuStyle(null);
      return;
    }
    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
      setQuery("");
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const dropdown =
    open && menuStyle ? (
      <div
        ref={dropdownRef}
        id={listboxId}
        role="listbox"
        aria-label="Search results"
        className="fixed z-[100] max-h-72 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md"
        style={{
          top: menuStyle.top,
          left: menuStyle.left,
          width: menuStyle.width,
        }}
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Searching…
          </div>
        ) : fetchError ? (
          <p className="px-3 py-6 text-center text-xs text-destructive">{fetchError}</p>
        ) : debouncedQuery.trim().length < minChars && !loadOnFocus ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            Type at least {minChars} characters
          </p>
        ) : options.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">{emptyText}</p>
        ) : (
          options.map((option, index) => (
            <button
              key={option.id}
              id={`${listboxId}-option-${index}`}
              type="button"
              role="option"
              aria-selected={value === option.id || activeIndex === index}
              ref={(el) => registerItemRef(index, el)}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => selectOptionAt(index)}
              className={cn(
                "flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left text-sm transition hover:bg-muted",
                value === option.id && "bg-primary/5",
                activeIndex === index && "bg-muted ring-1 ring-ring",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{option.label}</p>
                {option.sublabel ? (
                  <p className="truncate text-xs text-muted-foreground">{option.sublabel}</p>
                ) : null}
                {option.meta ? (
                  <p className="truncate text-[11px] text-muted-foreground/80">{option.meta}</p>
                ) : null}
              </div>
              {option.amount != null ? (
                <span className="shrink-0 text-xs font-semibold tabular-nums">
                  {formatCurrencyAmount(option.amount)}
                </span>
              ) : null}
            </button>
          ))
        )}
      </div>
    ) : null;

  return (
    <div
      ref={rootRef}
      data-enter-nav={open ? "off" : undefined}
      className={cn("relative w-full", className)}
    >
      <div ref={anchorRef} className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={displayValue}
          disabled={disabled}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
          data-form-type="other"
          placeholder={value && !open ? placeholder : searchPlaceholder}
          className="h-10 pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
          }
          onKeyDown={handleKeyDown}
          onFocus={() => {
            setOpen(true);
            if (!query && selectedLabel) setQuery("");
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (value) onChange(null);
          }}
        />
        {showBackgroundFetch ? (
          <Loader2 className="pointer-events-none absolute top-1/2 right-9 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute top-1/2 right-1 -translate-y-1/2"
            onClick={() => {
              onChange(null);
              setQuery("");
              setOpen(false);
            }}
            aria-label="Clear selection"
          >
            <X className="size-3.5" />
          </Button>
        ) : null}
      </div>

      {typeof document !== "undefined" && dropdown
        ? createPortal(dropdown, document.body)
        : null}
    </div>
  );
}

export function CustomerSearchSelect({
  value,
  onChange,
  selectedLabel,
  className,
  disabled,
  placeholder,
}: {
  value: string | null;
  onChange: (id: string | null, option?: EntitySearchOption) => void;
  selectedLabel?: string;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <EntitySearchSelect
      value={value}
      onChange={onChange}
      selectedLabel={selectedLabel}
      className={className}
      disabled={disabled}
      cacheScope="customer"
      placeholder={placeholder ?? "Select customer"}
      searchPlaceholder="Search by name, phone, or customer #…"
      emptyText="No customers found"
      minChars={1}
      loadOnFocus
      resolveSelectedOption={resolveCustomerPickerOption}
      fetchOptions={fetchCustomerSearchOptions}
    />
  );
}

export function VendorSearchSelect({
  value,
  onChange,
  selectedLabel,
  className,
  disabled,
  placeholder,
}: {
  value: string | null;
  onChange: (id: string | null, option?: EntitySearchOption) => void;
  selectedLabel?: string;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <EntitySearchSelect
      value={value}
      onChange={onChange}
      selectedLabel={selectedLabel}
      className={className}
      disabled={disabled}
      cacheScope="vendor"
      resolveSelectedOption={resolveVendorPickerOption}
      placeholder={placeholder ?? "Select vendor"}
      searchPlaceholder="Search vendor name, TRN, phone…"
      emptyText="No vendors found"
      minChars={1}
      loadOnFocus
      fetchOptions={fetchVendorSearchOptions}
    />
  );
}

export function ProductSearchSelect({
  value,
  onChange,
  storeId,
  selectedLabel,
  className,
  disabled,
  onPick,
}: {
  value: string | null;
  onChange: (id: string | null, option?: EntitySearchOption) => void;
  storeId?: string;
  selectedLabel?: string;
  className?: string;
  disabled?: boolean;
  onPick?: (option: EntitySearchOption & { variantId: string; unitPrice: number }) => void;
}) {
  return (
    <EntitySearchSelect
      value={value}
      onChange={(id, option) => {
        onChange(id, option);
        if (id && option && onPick) {
          const parts = option.meta?.split("|") ?? [];
          onPick({
            ...option,
            variantId: id,
            unitPrice: Number(parts[0] ?? 0),
          });
        }
      }}
      selectedLabel={selectedLabel}
      className={className}
      disabled={disabled}
      cacheScope={`product-select:${storeId ?? "none"}`}
      staleTime={ERP_PRODUCT_SEARCH_STALE_MS}
      gcTime={ERP_PRODUCT_SEARCH_GC_MS}
      placeholder="Search product or barcode"
      searchPlaceholder="Name, SKU, barcode…"
      emptyText="No products found"
      minChars={1}
      loadOnFocus={Boolean(storeId)}
      fetchOptions={async (q) => {
        const { fetchErpProductLiveSearch } = await import(
          "@/modules/erp/lib/erp-product-live-search.client"
        );
        const rows = (await fetchErpProductLiveSearch(
          "sales",
          q,
          storeId,
        )) as ErpSalesProductSearchRow[];
        return rows.map((row) => ({
          id: row.id,
          label: row.product_name,
          sublabel: row.barcode
            ? `Barcode: ${row.barcode} · Stock: ${row.available_stock ?? 0}`
            : `Stock: ${row.available_stock ?? 0}`,
          meta: `${row.sales_price ?? 0}|stock:${row.available_stock ?? 0}`,
        }));
      }}
    />
  );
}

export function InvoiceSearchSelect({
  value,
  onChange,
  selectedLabel,
  className,
  disabled,
  openOnly,
  storeId,
}: {
  value: string | null;
  onChange: (id: string | null, option?: EntitySearchOption) => void;
  selectedLabel?: string;
  className?: string;
  disabled?: boolean;
  openOnly?: boolean;
  storeId?: string;
}) {
  return (
    <EntitySearchSelect
      value={value}
      onChange={onChange}
      selectedLabel={selectedLabel}
      className={className}
      disabled={disabled}
      cacheScope={`invoice-select:${storeId ?? "all"}:${openOnly ? "open" : "all"}`}
      staleTime={ENTITY_DOCUMENT_SEARCH_STALE_MS}
      placeholder="Select invoice"
      searchPlaceholder="Invoice number or customer…"
      emptyText="No invoices found"
      minChars={1}
      loadOnFocus
      fetchOptions={async (q) => {
        const params = new URLSearchParams({ search: q, page: "0", limit: "15" });
        if (openOnly) params.set("openOnly", "1");
        if (storeId) params.set("storeId", storeId);
        const res = await adminGet<{
          data: Array<{
            id: string;
            invoice_number: string;
            customer_name: string | null;
            total_amount: number;
            balance_due: number;
            status: string;
            created_at: string;
          }>;
        }>(`erp/invoices?${params.toString()}`);
        return (res.data ?? []).map((inv) => ({
          id: inv.id,
          label: inv.invoice_number,
          sublabel: inv.customer_name ?? undefined,
          meta: `${inv.status} · ${inv.created_at?.slice(0, 10) ?? ""}`,
          amount: inv.balance_due > 0 ? inv.balance_due : inv.total_amount,
        }));
      }}
    />
  );
}

export function PurchaseBillSearchSelect({
  value,
  onChange,
  selectedLabel,
  className,
  disabled,
  vendorId,
  storeId,
}: {
  value: string | null;
  onChange: (id: string | null, option?: EntitySearchOption) => void;
  selectedLabel?: string;
  className?: string;
  disabled?: boolean;
  vendorId?: string;
  storeId?: string;
}) {
  return (
    <EntitySearchSelect
      value={value}
      onChange={onChange}
      selectedLabel={selectedLabel}
      className={className}
      disabled={disabled}
      cacheScope={`purchase-bill-select:${vendorId ?? "all"}:${storeId ?? "all"}`}
      staleTime={ENTITY_DOCUMENT_SEARCH_STALE_MS}
      placeholder="Select purchase bill"
      searchPlaceholder="Bill number or vendor bill #…"
      emptyText="No purchase bills found"
      minChars={1}
      loadOnFocus
      fetchOptions={async (q) => {
        const params = new URLSearchParams({ page: "0", limit: "20" });
        if (q.trim()) params.set("search", q.trim());
        if (vendorId) params.set("vendorId", vendorId);
        if (storeId) params.set("storeId", storeId);
        const res = await adminGet<{
          data: Array<{
            id: string;
            purchase_bill_number: string;
            vendor_name: string | null;
            balance_due: number;
            total_amount: number;
            purchase_date: string;
          }>;
        }>(`erp/purchase-bills?${params.toString()}`);
        return (res.data ?? []).map((bill) => ({
          id: bill.id,
          label: bill.purchase_bill_number,
          sublabel: bill.vendor_name ?? undefined,
          meta: bill.purchase_date,
          amount: bill.balance_due > 0 ? bill.balance_due : bill.total_amount,
        }));
      }}
    />
  );
}
