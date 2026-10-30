"use client";

import type { ReactNode } from "react";
import { Ban, ChevronDown, Search, X } from "lucide-react";

import { useAdminDateRangeContext } from "@/modules/admin/providers/admin-date-range-provider";
import {
  AdminListAsOfLead,
  AdminListDateRangeLead,
  type AdminDateRangePickerProps,
  type AdminListAsOfLeadProps,
} from "@/modules/admin/ui/admin-date-range-picker";

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

export type AdminFilterOption = { value: string; label: string };

export type AdminListFilter = {
  id?: string;
  label: string;
  value: string;
  options: AdminFilterOption[];
  onChange: (value: string) => void;
};

/** @deprecated Use AdminDateFilterControl */
export type AdminDateRange = {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
};

/** @deprecated Date range lives in the app header. */
export type AdminDateFilterControl = {
  value?: unknown;
  onChange?: unknown;
};

export function AdminListCard({
  filters,
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  dateFilter: _dateFilter,
  dateRange: _dateRange,
  inlineDateRange,
  inlineAsOf,
  toolbarExtra,
  addressFilters,
  emptyMessage,
  isEmpty,
  isLoading,
  isFiltering,
  onClearFilters,
  footer,
  children,
  className,
}: {
  filters?: AdminListFilter[];
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  /** @deprecated Use the app header date picker */
  dateFilter?: AdminDateFilterControl;
  /** @deprecated Use inlineDateRange */
  dateRange?: AdminDateRange;
  /**
   * Date range in the search toolbar (first segment).
   * `undefined` = use global admin date context. `false` = hidden.
   */
  inlineDateRange?: AdminDateRangePickerProps | false;
  /** As-of date (after date range when both are shown). `false` = hidden. */
  inlineAsOf?: AdminListAsOfLeadProps | false;
  toolbarExtra?: ReactNode;
  /** City / street / mall segments rendered inside the search InputGroup. */
  addressFilters?: ReactNode;
  emptyMessage: string;
  isEmpty: boolean;
  /** Initial fetch: show table shell + row skeletons instead of the empty state. */
  isLoading?: boolean;
  isFiltering?: boolean;
  onClearFilters?: () => void;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const globalDate = useAdminDateRangeContext();
  const resolvedInlineDate: AdminDateRangePickerProps | null =
    inlineDateRange === false
      ? null
      : inlineDateRange ?? {
          value: globalDate.value,
          onChange: globalDate.setValue,
        };

  const resolvedInlineAsOf =
    inlineAsOf === false || !inlineAsOf ? null : inlineAsOf;

  const hasToolbarFilters = (filters?.length ?? 0) > 0;
  const hasAddressFilters = Boolean(addressFilters);
  const showLeadDividerBeforeSearch = Boolean(
    resolvedInlineDate || resolvedInlineAsOf || hasToolbarFilters || hasAddressFilters,
  );

  return (
    <Card className={cn("overflow-hidden border border-border py-0 ring-0", className)}>
      <CardContent className="flex flex-col gap-0 p-0">
        <div className="space-y-2 border-b bg-muted/20 p-2.5">
          <InputGroup className="h-9 bg-background">
            {resolvedInlineDate ? (
              <AdminListDateRangeLead
                {...resolvedInlineDate}
                showDividerAfter={Boolean(resolvedInlineAsOf || hasToolbarFilters)}
              />
            ) : null}
            {resolvedInlineAsOf ? (
              <AdminListAsOfLead
                value={resolvedInlineAsOf.value}
                onChange={resolvedInlineAsOf.onChange}
                showDividerAfter={hasToolbarFilters}
              />
            ) : null}
            {filters?.map((filter, index) => (
              <span key={filter.id ?? filter.label} className="contents">
                {index > 0 ? (
                  <InputGroupAddon align="inline-start" className="px-0">
                    <div className="h-4 w-px bg-border" aria-hidden />
                  </InputGroupAddon>
                ) : null}
                <InputGroupAddon align="inline-start" className="pl-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <InputGroupButton
                          variant="ghost"
                          size="sm"
                          className="max-w-[150px] gap-1 truncate px-2"
                        />
                      }
                    >
                      <span className="truncate">
                        {filter.options.find((o) => o.value === filter.value)?.label ??
                          filter.label}
                      </span>
                      <ChevronDown className="size-3.5 opacity-60" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
                      <DropdownMenuGroup>
                        {filter.options.map((option) => (
                          <DropdownMenuItem
                            key={option.value}
                            onClick={() => filter.onChange(option.value)}
                          >
                            {option.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </InputGroupAddon>
              </span>
            ))}
            {(resolvedInlineDate || resolvedInlineAsOf || hasToolbarFilters) &&
            addressFilters ? (
              <InputGroupAddon align="inline-start" className="px-0">
                <div className="h-4 w-px bg-border" aria-hidden />
              </InputGroupAddon>
            ) : null}
            {addressFilters}
            {showLeadDividerBeforeSearch ? (
              <InputGroupAddon align="inline-start" className="px-0">
                <div className="h-4 w-px bg-border" aria-hidden />
              </InputGroupAddon>
            ) : null}
            <InputGroupAddon align="inline-start">
              <Search className="size-4 text-muted-foreground" aria-hidden />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
            />
            {search ? (
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onSearchChange("")}
                  aria-label="Clear search"
                >
                  <X className="size-3.5" />
                </InputGroupButton>
              </InputGroupAddon>
            ) : null}
            {isFiltering && onClearFilters && !toolbarExtra ? (
              <InputGroupAddon align="inline-end" className="pr-1">
                <InputGroupButton
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={onClearFilters}
                >
                  Clear
                </InputGroupButton>
              </InputGroupAddon>
            ) : null}
          </InputGroup>

          {toolbarExtra ? (
            <div className="flex flex-wrap items-end gap-3">
              {toolbarExtra}
              {isFiltering && onClearFilters ? (
                <Button variant="ghost" size="sm" onClick={onClearFilters} className="h-8">
                  Clear filters
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        {isLoading ? (
          <div className="overflow-x-auto">{children}</div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <Ban className="size-10 text-muted-foreground/25" aria-hidden />
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
            {isFiltering && onClearFilters ? (
              <Button variant="outline" size="sm" onClick={onClearFilters}>
                Clear filters
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto">{children}</div>
        )}

        {footer ? (
          <div className="border-t bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
            {footer}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function AdminListFooter({
  total,
  label,
  page,
  pageSize,
}: {
  total: number;
  label: string;
  page: number;
  pageSize: number;
}) {
  const start = total === 0 ? 0 : page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, total);
  return (
    <span>
      Showing <span className="font-medium text-foreground">{start}–{end}</span> of{" "}
      <span className="font-medium text-foreground">{total.toLocaleString()}</span> {label}
    </span>
  );
}
