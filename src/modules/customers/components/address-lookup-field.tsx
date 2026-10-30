"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Search } from "lucide-react";

import { useDebouncedValue } from "@/modules/admin/ui/use-debounced-value";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  ADDRESS_LOOKUP_DEBOUNCE_MS,
  ADDRESS_LOOKUP_GC_MS,
  ADDRESS_LOOKUP_STALE_MS,
  addressLookupQueryKey,
  createAddressLookup,
  fetchAddressLookups,
  prefetchAddressLookups,
  type AddressLookupContext,
  type AddressLookupKind,
} from "@/modules/customers/lib/address-lookup-search.client";

export type AddressLookupValue = {
  id: string | null;
  name: string;
};

export type AddressLookupSelectionMeta = {
  kind: AddressLookupKind;
  action: "pick" | "create";
};

export type AddressLookupFieldHandle = {
  focus: () => void;
  open: () => void;
};

const KIND_LABEL: Record<AddressLookupKind, { noun: string; addLabel: string }> = {
  city: { noun: "city", addLabel: "Add city and save" },
  mall: { noun: "mall", addLabel: "Add mall and save" },
  street: { noun: "street", addLabel: "Add street and save" },
};

const NEXT_KIND: Partial<Record<AddressLookupKind, AddressLookupKind>> = {
  city: "street",
  street: "mall",
};

/** Same toolbar may host multiple fields; ignore mousedown on siblings (avoid focus steal). */
export const ADDRESS_LOOKUP_ROOT_ATTR = "data-address-lookup-root";

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function namesMatch(a: string, b: string) {
  return normalizeName(a).toLowerCase() === normalizeName(b).toLowerCase();
}

function parentReady(kind: AddressLookupKind, ctx: AddressLookupContext): boolean {
  if (kind === "city") return true;
  if (kind === "street") return Boolean(ctx.cityId);
  return Boolean(ctx.streetId);
}

function blockedHint(kind: AddressLookupKind): string {
  if (kind === "street") return "Select a city first";
  if (kind === "mall") return "Select a street first";
  return "";
}

function seedLookupCache(
  queryClient: ReturnType<typeof useQueryClient>,
  kind: AddressLookupKind,
  row: { id: string; name: string },
  parentContext: AddressLookupContext,
) {
  queryClient.setQueryData(addressLookupQueryKey(kind, row.name, parentContext), [row]);
  queryClient.setQueryData(addressLookupQueryKey(kind, "", parentContext), (prev: unknown) => {
    const list = Array.isArray(prev) ? prev : [];
    if (list.some((r: { id: string }) => r.id === row.id)) return list;
    return [row, ...list].slice(0, 25);
  });
}

export const AddressLookupField = forwardRef<
  AddressLookupFieldHandle,
  {
    kind: AddressLookupKind;
    label: string;
    value: AddressLookupValue;
    onChange: (next: AddressLookupValue) => void;
    disabled?: boolean;
    placeholder?: string;
    parentContext?: AddressLookupContext;
    onSelectionComplete?: (
      option: { id: string; name: string },
      meta: AddressLookupSelectionMeta,
    ) => void;
    /** Toolbar row: h-9, narrow, no block layout */
    compact?: boolean;
    /** List filters: pick existing only. Default true (customer form). */
    allowCreate?: boolean;
  }
>(function AddressLookupField(
  {
    kind,
    label,
    value,
    onChange,
    disabled,
    placeholder,
    parentContext = {},
    onSelectionComplete,
    compact = false,
    allowCreate = true,
  },
  ref,
) {
  const queryClient = useQueryClient();
  const rootRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const focusInput = useCallback(() => {
    anchorRef.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, []);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );
  const listboxId = useId();
  const debouncedQuery = useDebouncedValue(query, ADDRESS_LOOKUP_DEBOUNCE_MS);
  const copy = KIND_LABEL[kind];

  const trimmedDebounced = debouncedQuery.trim();
  const canSearch = parentReady(kind, parentContext);
  const fieldDisabled = disabled || !canSearch;
  const queryEnabled = open && !fieldDisabled;

  const lookupQueryKey = addressLookupQueryKey(kind, trimmedDebounced, parentContext);

  const { data: options = [], isFetching, isFetched } = useQuery({
    queryKey: lookupQueryKey,
    queryFn: () => fetchAddressLookups(kind, trimmedDebounced, parentContext),
    enabled: queryEnabled,
    staleTime: ADDRESS_LOOKUP_STALE_MS,
    gcTime: ADDRESS_LOOKUP_GC_MS,
  });

  const loadingList =
    queryEnabled && (!isFetched || (isFetching && options.length === 0));

  const openDropdown = useCallback(() => {
    if (fieldDisabled) return;
    setOpen(true);
    void prefetchAddressLookups(queryClient, kind, parentContext, trimmedDebounced);
    requestAnimationFrame(() => focusInput());
  }, [fieldDisabled, focusInput, kind, parentContext, queryClient, trimmedDebounced]);

  useImperativeHandle(
    ref,
    () => ({
      focus: focusInput,
      open: openDropdown,
    }),
    [focusInput, openDropdown],
  );

  useEffect(() => {
    if (kind === "city") {
      void prefetchAddressLookups(queryClient, "city", {}, "");
    }
  }, [kind, queryClient]);

  useEffect(() => {
    if (kind === "street" && parentContext.cityId) {
      void prefetchAddressLookups(
        queryClient,
        "street",
        { cityId: parentContext.cityId },
        "",
      );
    }
  }, [kind, parentContext.cityId, queryClient]);

  useEffect(() => {
    if (kind === "mall" && parentContext.streetId) {
      void prefetchAddressLookups(
        queryClient,
        "mall",
        { cityId: parentContext.cityId, streetId: parentContext.streetId },
        "",
      );
    }
  }, [kind, parentContext.cityId, parentContext.streetId, queryClient]);

  const prefetchNextLevel = useCallback(
    (option: { id: string; name: string }) => {
      const nextKind = NEXT_KIND[kind];
      if (!nextKind) return;
      if (nextKind === "street") {
        void prefetchAddressLookups(queryClient, "street", { cityId: option.id }, "");
      } else if (nextKind === "mall" && parentContext.cityId) {
        void prefetchAddressLookups(queryClient, "mall", {
          cityId: parentContext.cityId,
          streetId: option.id,
        }, "");
      }
    },
    [kind, parentContext.cityId, queryClient],
  );

  const displayValue = open ? query : value.name;
  const typed = normalizeName(open ? query : value.name);
  const exactMatch = typed
    ? options.some((o) => namesMatch(o.name, typed)) || (value.id && namesMatch(value.name, typed))
    : false;
  const showCreateRow =
    allowCreate && Boolean(typed) && !exactMatch && !creating && canSearch;

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
    if (canSearch) return;
    setOpen(false);
    setQuery("");
  }, [canSearch]);

  const prevParentIds = useRef({
    cityId: parentContext.cityId,
    streetId: parentContext.streetId,
  });

  useEffect(() => {
    const prev = prevParentIds.current;
    if (
      prev.cityId === parentContext.cityId &&
      prev.streetId === parentContext.streetId
    ) {
      return;
    }
    prevParentIds.current = {
      cityId: parentContext.cityId,
      streetId: parentContext.streetId,
    };
    setOpen(false);
    setQuery("");
  }, [parentContext.cityId, parentContext.streetId]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      if (target instanceof Element) {
        const siblingRoot = target.closest(`[${ADDRESS_LOOKUP_ROOT_ATTR}]`);
        if (siblingRoot && siblingRoot !== rootRef.current) return;
      }
      setOpen(false);
      setQuery("");
      setCreateError(null);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const commitSelection = useCallback(
    (option: { id: string; name: string }, action: "pick" | "create") => {
      onChange({ id: option.id, name: option.name });
      setOpen(false);
      setQuery("");
      setCreateError(null);
      seedLookupCache(queryClient, kind, option, parentContext);
      prefetchNextLevel(option);
      onSelectionComplete?.(option, { kind, action });
    },
    [kind, onChange, onSelectionComplete, parentContext, prefetchNextLevel, queryClient],
  );

  function pickOption(option: { id: string; name: string }) {
    commitSelection(option, "pick");
  }

  async function saveNew() {
    if (!typed || !canSearch || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const row = await createAddressLookup(kind, typed, parentContext);
      commitSelection(row, "create");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setCreating(false);
    }
  }

  const dropdown =
    open && menuStyle && canSearch ? (
      <div
        ref={dropdownRef}
        id={listboxId}
        role="listbox"
        className="fixed z-[250] max-h-60 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md"
        style={{
          top: menuStyle.top,
          left: menuStyle.left,
          width: menuStyle.width,
        }}
      >
        {loadingList ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Searching…
          </div>
        ) : options.length === 0 && !showCreateRow ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">
            {trimmedDebounced
              ? `No ${copy.noun} matches`
              : allowCreate
                ? `No ${copy.noun}s yet — type to add`
                : `No ${copy.noun} matches`}
          </p>
        ) : (
          <>
            {options.map((option) => (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={value.id === option.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickOption(option)}
                className={cn(
                  "flex w-full rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted",
                  value.id === option.id && "bg-primary/5 font-medium",
                )}
              >
                {option.name}
              </button>
            ))}
            {showCreateRow ? (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void saveNew()}
                disabled={creating}
                className="mt-0.5 flex w-full items-center gap-2 rounded-md border border-dashed border-border px-2.5 py-2 text-left text-sm text-primary hover:bg-muted/80 disabled:opacity-60"
              >
                {creating ? (
                  <Loader2 className="size-4 shrink-0 animate-spin" />
                ) : (
                  <Plus className="size-4 shrink-0" />
                )}
                <span>
                  {copy.addLabel}: <span className="font-medium">{typed}</span>
                </span>
              </button>
            ) : null}
            {createError ? (
              <p className="px-2 py-1 text-xs text-destructive">{createError}</p>
            ) : null}
          </>
        )}
      </div>
    ) : null;

  return (
    <div
      ref={rootRef}
      {...{ [ADDRESS_LOOKUP_ROOT_ATTR]: "" }}
      className={cn("relative w-full", compact && "min-w-0")}
    >
      <div ref={anchorRef} className="relative">
        <Search
          className={cn(
            "pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground",
            compact ? "left-2 size-3.5" : "left-3 size-4",
          )}
        />
        <Input
          type="search"
          value={canSearch ? displayValue : ""}
          disabled={fieldDisabled}
          autoComplete="off"
          placeholder={
            !canSearch
              ? blockedHint(kind)
              : (placeholder ?? (compact ? label : `Search ${copy.noun}…`))
          }
          aria-label={label}
          className={cn(
            "[&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden",
            compact
              ? "h-9 border-0 bg-transparent px-7 text-xs shadow-none focus-visible:ring-0"
              : "h-10 pr-9 pl-9",
          )}
          role="combobox"
          aria-expanded={open && canSearch}
          aria-controls={listboxId}
          onFocus={() => {
            if (!canSearch) return;
            setQuery("");
            setOpen(true);
            void prefetchAddressLookups(queryClient, kind, parentContext, "");
          }}
          onBlur={() => {
            window.setTimeout(() => {
              const active = document.activeElement;
              if (dropdownRef.current?.contains(active)) return;
              if (rootRef.current?.contains(active)) return;
              setOpen(false);
              setQuery("");
            }, 0);
          }}
          onChange={(e) => {
            if (!canSearch) return;
            setQuery(e.target.value);
            setOpen(true);
            onChange({ id: null, name: e.target.value });
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setQuery("");
            }
            if (e.key === "Enter" && showCreateRow) {
              e.preventDefault();
              void saveNew();
            }
          }}
        />
        {isFetching && open && canSearch && options.length === 0 && !creating ? (
          <Loader2 className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
      </div>
      {typeof document !== "undefined" && dropdown
        ? createPortal(dropdown, document.body)
        : null}
    </div>
  );
});
