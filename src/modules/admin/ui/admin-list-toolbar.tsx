"use client";

import type { ReactNode } from "react";
import { Ban, Calendar, ChevronDown, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type AdminFilterOption = { value: string; label: string };

export type AdminListFilter = {
  id?: string;
  label: string;
  value: string;
  options: AdminFilterOption[];
  onChange: (value: string) => void;
};

export type AdminDateRange = {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
};

export function AdminListCard({
  filters,
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  dateRange,
  toolbarExtra,
  emptyMessage,
  isEmpty,
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
  dateRange?: AdminDateRange;
  toolbarExtra?: ReactNode;
  emptyMessage: string;
  isEmpty: boolean;
  isFiltering?: boolean;
  onClearFilters?: () => void;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("overflow-hidden border border-border py-0 ring-0", className)}>
      <CardContent className="flex flex-col gap-0 p-0">
        <div className="space-y-2 border-b bg-muted/20 p-2.5">
          <InputGroup className="h-9 bg-background">
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
            {(filters?.length ?? 0) > 0 ? (
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
          </InputGroup>

          {(dateRange || toolbarExtra) && (
            <div className="flex flex-wrap items-end gap-3">
              {dateRange ? (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <Label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Calendar className="size-3" />
                      From
                    </Label>
                    <Input
                      type="date"
                      value={dateRange.from}
                      onChange={(e) => dateRange.onFromChange(e.target.value)}
                      className="h-8 w-[140px] text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">To</Label>
                    <Input
                      type="date"
                      value={dateRange.to}
                      onChange={(e) => dateRange.onToChange(e.target.value)}
                      className="h-8 w-[140px] text-xs"
                    />
                  </div>
                </div>
              ) : null}
              {toolbarExtra}
              {isFiltering && onClearFilters ? (
                <Button variant="ghost" size="sm" onClick={onClearFilters} className="h-8">
                  Clear filters
                </Button>
              ) : null}
            </div>
          )}
        </div>

        {isEmpty ? (
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
