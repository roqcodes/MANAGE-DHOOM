"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  groupPagesBySection,
  SearchEntityResultRow,
  SearchGroupHeader,
  SearchPageResultRow,
} from "@/modules/admin/components/admin-search-results";
import { AdminSearchHintRotator } from "@/modules/admin/components/admin-search-hints";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { filterSearchIndex } from "@/modules/admin/lib/admin-search-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import type { AdminSearchIndexResponse } from "@/modules/admin/types/admin-search";
import { useAdminBootstrap } from "@/modules/admin/providers/admin-bootstrap-provider";
import { cn } from "@/lib/utils";

type AdminGlobalSearchContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const AdminGlobalSearchContext = createContext<AdminGlobalSearchContextValue | null>(
  null,
);

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

function useSearchIndex(enabled: boolean) {
  return useQuery({
    queryKey: adminQueryKeys.searchIndex(),
    queryFn: () => adminGet<AdminSearchIndexResponse>("search-index"),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    enabled,
  });
}

export function AdminGlobalSearchProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { secondaryQueriesEnabled } = useAdminBootstrap();

  useEffect(() => {
    if (!secondaryQueriesEnabled) return;
    const prefetch = () => {
      void queryClient.prefetchQuery({
        queryKey: adminQueryKeys.searchIndex(),
        queryFn: () => adminGet<AdminSearchIndexResponse>("search-index"),
        staleTime: 5 * 60_000,
      });
    };
    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(prefetch, { timeout: 12_000 });
      return () => window.cancelIdleCallback(idleId);
    }
    const timeoutId = window.setTimeout(prefetch, 8_000);
    return () => window.clearTimeout(timeoutId);
  }, [queryClient, secondaryQueriesEnabled]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
        return;
      }

      if (event.key !== " " || event.repeat) return;
      if (open || isTypingTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      event.preventDefault();
      setOpen(true);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const value = useMemo(
    () => ({
      open,
      setOpen,
    }),
    [open],
  );

  return (
    <AdminGlobalSearchContext.Provider value={value}>
      {children}
      <AdminGlobalSearchDialog />
    </AdminGlobalSearchContext.Provider>
  );
}

export function useAdminGlobalSearch() {
  const context = useContext(AdminGlobalSearchContext);
  if (!context) {
    throw new Error("useAdminGlobalSearch must be used within AdminGlobalSearchProvider");
  }
  return context;
}

export function AdminSearchTrigger({ className }: { className?: string }) {
  const { setOpen } = useAdminGlobalSearch();

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Quick search"
      className={cn(
        "group/search relative flex h-10 w-full items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white/90 px-3.5 text-left text-sm shadow-sm shadow-slate-900/[0.04] outline-none",
        "transition-all duration-300 ease-out",
        "hover:-translate-y-px hover:border-[#2563EB]/30 hover:bg-white hover:shadow-md hover:shadow-[#2563EB]/[0.07]",
        "focus-visible:border-[#2563EB]/40 focus-visible:ring-2 focus-visible:ring-[#2563EB]/15",
        "active:translate-y-0 active:shadow-sm",
        className,
      )}
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400 transition-all duration-300 group-hover/search:bg-[#2563EB]/10 group-hover/search:text-[#2563EB]">
        <Search className="size-4" aria-hidden />
      </span>
      <AdminSearchHintRotator />
      <kbd className="hidden shrink-0 rounded-md border border-slate-200/90 bg-slate-50/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 transition-colors duration-300 group-hover/search:border-slate-300 group-hover/search:text-slate-500 sm:inline">
        Space
      </kbd>
    </button>
  );
}

function AdminGlobalSearchDialog() {
  const router = useRouter();
  const { open, setOpen } = useAdminGlobalSearch();
  const [query, setQuery] = useState("");
  const { data: index, isLoading, isError, isFetching } = useSearchIndex(open);

  const groups = useMemo(
    () => filterSearchIndex(index?.items ?? [], query),
    [index?.items, query],
  );

  const totalIndexed = useMemo(() => {
    if (!index) return 0;
    return Object.values(index.counts).reduce((sum, count) => sum + count, 0);
  }, [index]);

  const trimmedQuery = query.trim();
  const showPageGrid = trimmedQuery.length === 0;
  const pageSections = useMemo(() => {
    const pagesGroup = groups.find((group) => group.id === "pages");
    if (!pagesGroup) return [];
    return groupPagesBySection(pagesGroup.items);
  }, [groups]);

  const handleSelect = useCallback(
    (href: string) => {
      setOpen(false);
      setQuery("");
      router.push(href);
    },
    [router, setOpen],
  );

  const showInitialLoader = open && isLoading && !index;
  const showRefreshing = open && isFetching && !!index;

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
      title="Quick search"
      description="Search pages, orders, products, purchase orders, and more"
      className="top-[5%] w-[calc(100%-1.5rem)] max-w-4xl translate-y-0 sm:top-[6%] sm:max-w-4xl"
    >
      <Command shouldFilter={false}>
        <div className="border-b border-border/60 p-2 pb-0">
          <CommandInput
            placeholder="Search anything — pages, orders, products, customers, vendors…"
            value={query}
            onValueChange={setQuery}
            className="text-base"
          />
        </div>
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-1.5 text-[11px] text-muted-foreground">
          <span>
            {index
              ? `${totalIndexed.toLocaleString()} records indexed`
              : "Indexing admin data…"}
          </span>
          {showRefreshing ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="size-3 animate-spin" aria-hidden />
              Refreshing
            </span>
          ) : index ? (
            <span>Instant search</span>
          ) : null}
        </div>
        <CommandList className="max-h-[min(72vh,42rem)] scroll-py-2">
          {showInitialLoader ? (
            <div className="flex flex-col items-center justify-center gap-2 py-14 text-sm text-slate-500">
              <Loader2 className="size-5 animate-spin" aria-hidden />
              Building search index…
            </div>
          ) : isError ? (
            <CommandEmpty>Could not load search index. Refresh and try again.</CommandEmpty>
          ) : groups.length === 0 ? (
            <CommandEmpty>
              {trimmedQuery.length === 0
                ? "No pages available."
                : `No results for “${trimmedQuery}”.`}
            </CommandEmpty>
          ) : (
            groups.map((group, groupIndex) => (
              <div key={group.id}>
                {groupIndex > 0 ? <CommandSeparator className="my-2" /> : null}

                {group.id === "pages" && showPageGrid ? (
                  <div className="px-1 py-1">
                    <SearchGroupHeader group={group} showCount={false} />
                    {pageSections.map((section) => (
                      <div key={section.section} className="mb-3 last:mb-1">
                        <p className="mb-1.5 px-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                          {section.section}
                        </p>
                        <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
                          {section.items.map((item, index) => (
                            <CommandItem
                              key={`${group.id}-${item.id}`}
                              value={`${group.id}-${item.id}-${item.title}`}
                              onSelect={() => handleSelect(item.href)}
                              className="items-center rounded-xl px-2 py-2.5 [&>svg:last-child]:hidden"
                            >
                              <SearchPageResultRow item={item} iconIndex={index} />
                            </CommandItem>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-1 py-1">
                    <SearchGroupHeader group={group} showCount={group.id !== "pages"} />
                    <CommandGroup className="p-0 **:[[cmdk-group-heading]]:hidden">
                      {group.items.map((item, index) => (
                      <CommandItem
                        key={`${group.id}-${item.id}`}
                        value={`${group.id}-${item.id}-${item.title}`}
                        onSelect={() => handleSelect(item.href)}
                        className={cn(
                          "items-start rounded-xl px-2 py-2.5 [&>svg:last-child]:hidden",
                          group.id === "pages" ? "items-center py-2.5" : "py-3",
                        )}
                      >
                        {group.id === "pages" ? (
                          <SearchPageResultRow item={item} iconIndex={index} />
                        ) : (
                          <SearchEntityResultRow item={item} groupId={group.id} />
                        )}
                      </CommandItem>
                    ))}
                    </CommandGroup>
                  </div>
                )}
              </div>
            ))
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
