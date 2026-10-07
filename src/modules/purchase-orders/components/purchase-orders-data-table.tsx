"use client";

import { useMemo } from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
  ChevronDown,
  Download,
  MoreHorizontal,
  Package,
  Printer,
  X,
} from "lucide-react";

import type { AdminPurchaseOrderListRow } from "@/common/admin/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { useSortableData } from "@/lib/hooks/use-sortable-data";
import { cn } from "@/lib/utils";
import { currencyLabel } from "@/lib/format-currency";
import { displayErpDocumentNumber } from "@/lib/erp-document-ref";
import {
  ExpectedDeliveryDate,
  formatInr,
  PO_ACCENT,
  PoStatusPill,
} from "@/modules/purchase-orders/components/purchase-orders-ui";

function exportPurchaseOrdersCsv(orders: AdminPurchaseOrderListRow[]) {
  const headers = [
    "PO ID",
    "Vendor",
    "Created",
    "Expected delivery",
    "Status",
    "Total (INR)",
  ];

  const rows = orders.map((po) => [
    displayErpDocumentNumber(po.po_number, "PO", po.id),
    po.vendors?.name ?? "—",
    po.created_at
      ? format(new Date(po.created_at), "yyyy-MM-dd HH:mm")
      : "",
    po.expected_delivery_date ?? "",
    po.status ?? "",
    String(Number(po.total_amount ?? 0)),
  ]);

  const csv = [headers, ...rows]
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
    )
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `purchase-orders-export-${format(new Date(), "yyyy-MM-dd")}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function VendorPopover({ row }: { row: AdminPurchaseOrderListRow }) {
  const name = row.vendors?.name?.trim() || "Unknown vendor";
  const vendorId = row.vendor_id;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1 text-[13px] font-medium leading-snug text-foreground hover:text-primary hover:underline",
              PO_ACCENT.focus,
            )}
          />
        }
      >
        {name}
        <ChevronDown />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <PopoverHeader>
          <PopoverTitle>{name}</PopoverTitle>
        </PopoverHeader>
        <div className="flex flex-col gap-2 text-sm">
          {vendorId ? (
            <p className="font-mono text-xs text-muted-foreground">{vendorId}</p>
          ) : null}
          {vendorId ? (
            <Link
              href={`/admin/vendors/${vendorId}`}
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              View vendor
            </Link>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function PurchaseOrdersBulkActionBar({
  selectedIds,
  orders,
  onClearSelection,
}: {
  selectedIds: Set<string>;
  orders: AdminPurchaseOrderListRow[];
  onClearSelection: () => void;
}) {
  const selectedOrders = useMemo(
    () => orders.filter((o) => selectedIds.has(o.id)),
    [orders, selectedIds],
  );

  if (selectedIds.size === 0) return null;

  return (
    <div
      className={cn(
        "sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 backdrop-blur-sm",
        PO_ACCENT.selectionBar,
      )}
    >
      <p className="text-sm font-medium">
        {selectedIds.size} PO{selectedIds.size === 1 ? "" : "s"} selected
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            for (const id of selectedIds) {
              window.open(
                `/admin/purchase-orders/${id}/invoice`,
                "_blank",
                "noopener,noreferrer",
              );
            }
          }}
        >
          <Printer data-icon="inline-start" />
          Print invoices
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => exportPurchaseOrdersCsv(selectedOrders)}
        >
          <Download data-icon="inline-start" />
          Export CSV
        </Button>
        <Button size="sm" variant="ghost" onClick={onClearSelection}>
          <X data-icon="inline-start" />
          Clear
        </Button>
      </div>
    </div>
  );
}

export { exportPurchaseOrdersCsv };

export function PurchaseOrdersDataTable({
  orders,
  selectedIds,
  onSelectedIdsChange,
  sortByExpectedDelivery = false,
}: {
  orders: AdminPurchaseOrderListRow[];
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
  sortByExpectedDelivery?: boolean;
}) {
  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    orders,
    sortByExpectedDelivery ? "expected_delivery_date" : "created_at",
    sortByExpectedDelivery ? "asc" : "desc",
    (row, key) => {
      if (key === "vendor_name") return row.vendors?.name ?? "";
      if (key === "po_number") return row.po_number ?? row.id;
      return (row as unknown as Record<string, unknown>)[key];
    },
  );

  const pageIds = sorted.map((o) => o.id);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));

  function toggleAllOnPage(checked: boolean) {
    onSelectedIdsChange(
      (() => {
        const next = new Set(selectedIds);
        if (checked) pageIds.forEach((id) => next.add(id));
        else pageIds.forEach((id) => next.delete(id));
        return next;
      })(),
    );
  }

  function toggleRow(id: string, checked: boolean) {
    onSelectedIdsChange(
      (() => {
        const next = new Set(selectedIds);
        if (checked) next.add(id);
        else next.delete(id);
        return next;
      })(),
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <Package className="size-10 text-muted-foreground/40" aria-hidden />
        <p className="text-sm text-muted-foreground">
          No purchase orders in this view.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-b border-border/60 hover:bg-transparent">
          <TableHead className="w-10">
            <Checkbox
              aria-label="Select all purchase orders on this page"
              checked={allPageSelected}
              onCheckedChange={(checked) => toggleAllOnPage(checked === true)}
            />
          </TableHead>
          <SortableTableHead
            label="PO"
            sortKey="po_number"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
          />
          <SortableTableHead
            label="Vendor"
            sortKey="vendor_name"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
          />
          <SortableTableHead
            label="Created"
            sortKey="created_at"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
          />
          <SortableTableHead
            label="Expected delivery"
            sortKey="expected_delivery_date"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
          />
          <SortableTableHead
            label="Status"
            sortKey="status"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
          />
          <SortableTableHead
            label={currencyLabel("Total")}
            sortKey="total_amount"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
            align="right"
          />
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((po) => {
          const isSelected = selectedIds.has(po.id);
          const total = Number(po.total_amount ?? 0);

          return (
            <TableRow
              key={po.id}
              data-state={isSelected ? "selected" : undefined}
              className={cn(
                "border-b border-border/60 hover:bg-muted/40",
                PO_ACCENT.selectedRow,
              )}
            >
              <TableCell>
                <Checkbox
                  aria-label={`Select PO ${displayErpDocumentNumber(po.po_number, "PO", po.id)}`}
                  checked={isSelected}
                  onCheckedChange={(checked) =>
                    toggleRow(po.id, checked === true)
                  }
                />
              </TableCell>
              <TableCell>
                <Link
                  href={`/admin/purchase-orders/${po.id}`}
                  className="font-mono text-[13px] font-medium leading-snug text-foreground hover:text-primary hover:underline"
                >
                  {displayErpDocumentNumber(po.po_number, "PO", po.id)}
                </Link>
              </TableCell>
              <TableCell>
                <VendorPopover row={po} />
              </TableCell>
              <TableCell className="text-[13px] text-muted-foreground">
                {po.created_at
                  ? format(new Date(po.created_at), "MMM d, yyyy")
                  : "—"}
              </TableCell>
              <TableCell>
                <ExpectedDeliveryDate dateStr={po.expected_delivery_date} />
              </TableCell>
              <TableCell>
                <PoStatusPill status={po.status} />
              </TableCell>
              <TableCell className="text-right text-sm font-semibold tabular-nums">
                {formatInr(total)}
              </TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Purchase order actions"
                      />
                    }
                  >
                    <MoreHorizontal />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuGroup>
                      <DropdownMenuItem
                        nativeButton={false}
                        render={
                          <Link href={`/admin/purchase-orders/${po.id}`} />
                        }
                      >
                        View PO
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        nativeButton={false}
                        render={
                          <Link
                            href={`/admin/purchase-orders/${po.id}/invoice`}
                            target="_blank"
                          />
                        }
                      >
                        Print invoice
                      </DropdownMenuItem>
                      {po.vendor_id ? (
                        <DropdownMenuItem
                          nativeButton={false}
                          render={
                            <Link href={`/admin/vendors/${po.vendor_id}`} />
                          }
                        >
                          View vendor
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuItem
                        onClick={() => exportPurchaseOrdersCsv([po])}
                      >
                        Export row
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
