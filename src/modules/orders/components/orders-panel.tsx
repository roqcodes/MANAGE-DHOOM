"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { format, isAfter, isBefore, startOfDay, endOfDay, subDays } from "date-fns";
import { Ban, ChevronDown, Columns3, Search } from "lucide-react";

import type { Order, OrderCatalogStats } from "@/common/admin/types";
import type { OutboxOperationRecord } from "@/lib/sync/outbox-types";
import type { OrderFilterUserRow } from "@/modules/orders/services/orders.service";
import { Pagination } from "@/modules/admin/components/pagination";
import { CustomerSearchSelect } from "@/modules/admin/ui";
import { resolveCustomerPickerOption } from "@/modules/erp/lib/entity-live-search.client";
import {
  exportOrdersCsv,
  OrdersBulkActionBar,
  OrdersDataTable,
} from "@/modules/orders/components/orders-data-table";
import { OrdersMetricsBar } from "@/modules/orders/components/orders-metrics-bar";
import {
  matchesViewFilter,
  ORDERS_ACCENT,
  ORDERS_VIEW_FILTERS,
  shortOrderRef,
  type OrdersViewFilter,
} from "@/modules/orders/components/orders-ui";
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

function orderMatchesDateRange(
  order: Order,
  from: string,
  to: string,
): boolean {
  if (!order.created_at) return false;
  const created = new Date(order.created_at);

  if (from) {
    const fromDate = startOfDay(new Date(from));
    if (isBefore(created, fromDate)) return false;
  }

  if (to) {
    const toDate = endOfDay(new Date(to));
    if (isAfter(created, toDate)) return false;
  }

  return true;
}

export function OrdersPanel({
  orders,
  total,
  page,
  statusFilter,
  filterUsers: _filterUsers,
  selectedUserId,
  stats,
  channel = "online",
  basePath = "/admin/orders",
  outboxOperations,
}: {
  orders: Order[];
  total: number;
  page: number;
  statusFilter: string;
  filterUsers: OrderFilterUserRow[];
  selectedUserId: string | null;
  stats: OrderCatalogStats;
  channel?: "online" | "erp";
  basePath?: string;
  outboxOperations?: OutboxOperationRecord[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [viewFilter, setViewFilter] = useState<OrdersViewFilter>("all");
  const [datePreset, setDatePreset] = useState<"7" | "30" | "90" | "custom">("30");
  const [dateFrom, setDateFrom] = useState(
    format(subDays(new Date(), 30), "yyyy-MM-dd"),
  );
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [customerFilterLabel, setCustomerFilterLabel] = useState("");

  useEffect(() => {
    if (!selectedUserId) {
      setCustomerFilterLabel("");
      return;
    }
    void resolveCustomerPickerOption(selectedUserId)
      .then((option) => setCustomerFilterLabel(option.label))
      .catch(() => setCustomerFilterLabel(""));
  }, [selectedUserId]);

  const listParams: Record<string, string> = {};
  if (statusFilter !== "all") listParams.status = statusFilter;
  if (selectedUserId) listParams.userId = selectedUserId;

  function handleUserFilter(userId: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (userId) params.set("userId", userId);
    else params.delete("userId");
    params.delete("page");
    router.push(`${basePath}?${params.toString()}`);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return orders.filter((o) => {
      if (!matchesViewFilter(o, viewFilter)) return false;

      if (dateFrom || dateTo) {
        if (!orderMatchesDateRange(o, dateFrom, dateTo)) return false;
      }

      if (!q) return true;

      const idMatch = o.id.toLowerCase().includes(q);
      const refMatch = shortOrderRef(o.id).toLowerCase().includes(q);
      const name = (o.users?.name ?? "").toLowerCase();
      const email = (o.users?.email ?? "").toLowerCase();
      return idMatch || refMatch || name.includes(q) || email.includes(q);
    });
  }, [orders, search, dateFrom, dateTo, viewFilter]);

  const isFiltering =
    search.trim().length > 0 ||
    dateFrom.length > 0 ||
    dateTo.length > 0 ||
    viewFilter !== "all" ||
    selectedUserId !== null;

  const activeFilterLabel =
    ORDERS_VIEW_FILTERS.find((f) => f.id === viewFilter)?.label ?? "All";

  return (
    <div className="flex flex-col gap-4">
      <OrdersMetricsBar
        stats={stats}
        datePreset={datePreset}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDatePresetChange={setDatePreset}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onExport={() => exportOrdersCsv(filtered)}
        variant={channel}
      />

      {channel === "online" ? (
        <div className="flex justify-end">
          <Link
            href="/admin/erp/fulfillment-queue"
            className={`text-sm font-medium hover:underline ${ORDERS_ACCENT.link}`}
          >
            Open fulfillment queue →
          </Link>
        </div>
      ) : null}

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
                        className={cn("gap-1 px-2", ORDERS_ACCENT.focus)}
                      />
                    }
                  >
                    {activeFilterLabel}
                    <ChevronDown />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuGroup>
                      {ORDERS_VIEW_FILTERS.map((option) => (
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
              <InputGroupAddon align="inline-start" className="min-w-[11rem] max-w-[14rem] py-0.5 pr-1">
                <CustomerSearchSelect
                  value={selectedUserId}
                  selectedLabel={customerFilterLabel || undefined}
                  placeholder="All customers"
                  className="[&_input]:h-8 [&_input]:border-0 [&_input]:bg-transparent [&_input]:shadow-none"
                  onChange={(id, option) => {
                    setCustomerFilterLabel(option?.label ?? "");
                    handleUserFilter(id);
                  }}
                />
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
                  className={ORDERS_ACCENT.focus}
                >
                  <Columns3 />
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </div>

          <div className="px-2 pt-2">
            <OrdersBulkActionBar
              selectedIds={selectedIds}
              orders={filtered}
              onClearSelection={() => setSelectedIds(new Set())}
              variant={channel}
            />
          </div>

          {filtered.length === 0 &&
          !(channel === "erp" && outboxOperations && outboxOperations.length > 0) ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <Ban className="size-12 text-muted-foreground/30" aria-hidden />
              <p className="text-sm text-muted-foreground">
                {isFiltering
                  ? "No orders match your filters on this page."
                  : "No orders in this view."}
              </p>
              {isFiltering ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setViewFilter("all");
                    setDatePreset("30");
                    const to = new Date();
                    setDateFrom(format(subDays(to, 30), "yyyy-MM-dd"));
                    setDateTo(format(to, "yyyy-MM-dd"));
                  }}
                >
                  Clear filters
                </Button>
              ) : null}
            </div>
          ) : (
            <OrdersDataTable
              orders={filtered}
              selectedIds={selectedIds}
              onSelectedIdsChange={setSelectedIds}
              variant={channel}
              detailBasePath={basePath}
              outboxOperations={channel === "erp" ? outboxOperations : undefined}
            />
          )}

          <div className="flex items-center justify-between gap-3 border-t px-3 py-2 text-xs text-muted-foreground">
            <span>
              {isFiltering
                ? `${filtered.length} of ${orders.length} on this page`
                : `Page ${page + 1} · ${total.toLocaleString("en-IN")} matching`}
            </span>
            {selectedUserId ? (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => handleUserFilter(null)}
              >
                Clear customer filter
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {!isFiltering && total > orders.length ? (
        <Pagination
          total={total}
          page={page}
          basePath={basePath}
          extraParams={listParams}
        />
      ) : null}
    </div>
  );
}
