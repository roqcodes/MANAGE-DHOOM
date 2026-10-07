"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type FilterFn,
} from "@tanstack/react-table";
import { format, isToday, isYesterday } from "date-fns";
import { MessageSquare, MoreHorizontal, Search, UserRound } from "lucide-react";

import type {
  AnalyticsActionType,
  CustomerActivityRow,
} from "@/common/analytics/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { useSortableData } from "@/lib/hooks/use-sortable-data";
import { CurrencyAmount } from "@/components/currency-amount";
import { useCurrencySettings } from "@/modules/settings/providers/currency-settings-provider";

type ActivityTab = "all" | "carted" | "purchased";

const ACTION_LABEL: Record<AnalyticsActionType, string> = {
  viewed_product: "Viewed Product",
  added_to_cart: "Added to Cart",
  placed_order: "Placed Order",
  abandoned_cart: "Abandoned Cart",
};

function actionVariant(
  action: AnalyticsActionType,
): "outline" | "secondary" | "default" | "destructive" {
  if (action === "placed_order") return "default";
  if (action === "abandoned_cart") return "destructive";
  if (action === "added_to_cart") return "secondary";
  return "outline";
}

function formatTs(iso: string) {
  const d = new Date(iso);
  const time = format(d, "h:mm a");
  if (isToday(d)) return `Today at ${time}`;
  if (isYesterday(d)) return `Yesterday at ${time}`;
  return format(d, "MMM d, yyyy · h:mm a");
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

const globalFilterFn: FilterFn<CustomerActivityRow> = (row, _id, value) => {
  const q = String(value ?? "").toLowerCase().trim();
  if (!q) return true;
  const name = row.original.customerName.toLowerCase();
  const phone = (row.original.phone ?? "").toLowerCase();
  return name.includes(q) || phone.includes(q);
};

export function CustomerActivityTable({
  rows,
}: {
  rows: CustomerActivityRow[];
}) {
  const { label: currencyLabel } = useCurrencySettings();
  const [tab, setTab] = useState<ActivityTab>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (tab === "carted") {
      return rows.filter(
        (r) =>
          r.actionType === "added_to_cart" || r.actionType === "abandoned_cart",
      );
    }
    if (tab === "purchased") {
      return rows.filter((r) => r.actionType === "placed_order");
    }
    return rows;
  }, [rows, tab]);

  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    filtered,
    "timestamp",
    "desc",
    (row, key) => {
      if (key === "customer") return row.customerName;
      if (key === "product") return row.productName;
      if (key === "qtyValue") return row.value;
      return (row as unknown as Record<string, unknown>)[key];
    },
  );

  const columns = useMemo<ColumnDef<CustomerActivityRow>[]>(
    () => [
      {
        id: "customer",
        header: "Customer",
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex items-center gap-2.5">
              <Avatar size="sm">
                <AvatarFallback>{initials(r.customerName) || "?"}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {r.customerName}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.phone?.trim() || "No phone"}
                </p>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "actionType",
        header: "Action",
        cell: ({ row }) => (
          <Badge variant={actionVariant(row.original.actionType)}>
            {ACTION_LABEL[row.original.actionType]}
          </Badge>
        ),
      },
      {
        id: "product",
        header: "Product / SKU",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{row.original.productName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {row.original.sku ?? "—"}
            </p>
          </div>
        ),
      },
      {
        id: "qtyValue",
        header: () => currencyLabel("Qty · Value"),
        cell: ({ row }) => (
          <div className="text-sm tabular-nums">
            <span className="font-medium">{row.original.quantity}</span>
            <span className="text-muted-foreground"> · </span>
            <CurrencyAmount amount={row.original.value} showSymbol={false} />
          </div>
        ),
      },
      {
        accessorKey: "timestamp",
        header: "When",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {formatTs(row.original.timestamp)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const r = row.original;
          const profileHref = r.customerId
            ? `/admin/customers/${r.customerId}`
            : "#";
          return (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Row actions"
                  />
                }
              >
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    disabled={!r.customerId}
                    nativeButton={false}
                    render={<Link href={profileHref} />}
                  >
                    <UserRound />
                    View Customer Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!r.phone}
                    onClick={() => {
                      if (r.phone) {
                        window.open(`sms:${r.phone}`, "_blank");
                      }
                    }}
                  >
                    <MessageSquare />
                    Message Customer
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [currencyLabel],
  );

  const table = useReactTable({
    data: sorted,
    columns,
    state: { globalFilter: query },
    onGlobalFilterChange: setQuery,
    globalFilterFn,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  });

  return (
    <Card className="border border-border bg-card shadow-none ring-0">
      <CardHeader className="border-b border-border">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <CardTitle className="text-sm font-semibold">
            Customer activity log
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name or phone"
                className="h-8 w-52 border-border pl-7"
              />
            </div>
            <Tabs
              value={tab}
              onValueChange={(v) => setTab((v as ActivityTab) ?? "all")}
            >
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="carted">Carted</TabsTrigger>
                <TabsTrigger value="purchased">Purchased</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead
                label="Customer"
                sortKey="customer"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableTableHead
                label="Action"
                sortKey="actionType"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableTableHead
                label="Product / SKU"
                sortKey="product"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableTableHead
                label={currencyLabel("Qty · Value")}
                sortKey="qtyValue"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableTableHead
                label="When"
                sortKey="timestamp"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  No activity for this filter.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between border-t border-border px-3 py-2">
          <p className="text-xs text-muted-foreground">
            {table.getFilteredRowModel().rows.length} events
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
            >
              Previous
            </Button>
            <span className="text-xs tabular-nums text-muted-foreground">
              {table.getState().pagination.pageIndex + 1} /{" "}
              {table.getPageCount() || 1}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
            >
              Next
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
