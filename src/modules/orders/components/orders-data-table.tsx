"use client";

import { useMemo, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  Columns3,
  Download,
  Mail,
  MapPin,
  MoreHorizontal,
  Package,
  Phone,
  Printer,
  Truck,
  X,
} from "lucide-react";

import type { Order } from "@/common/admin/types";
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
import { formatErpDocRef } from "@/lib/erp-document-ref";
import {
  bulkUpdateOrderStatusAction,
} from "@/modules/orders/actions/orders.actions";
import {
  formatInr,
  CustomerEditedPill,
  FulfillmentPill,
  InventoryFulfillmentStatusPill,
  isCustomerEditedOrder,
  ORDERS_ACCENT,
  PaymentPill,
  paymentStatusLabel,
  shortOrderRef,
  customerInitials,
} from "@/modules/orders/components/orders-ui";
import { SalesOrderOutboxTableRows } from "@/modules/orders/components/sales-order-outbox-table-rows";
import type { OutboxOperationRecord } from "@/lib/sync/outbox-types";

function CompactPopoverShell({
  label,
  title,
  subtitle,
  children,
  footer,
  className,
}: {
  label: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col overflow-hidden", className)}>
      <div className="border-b border-border/60 bg-muted/25 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 text-[13px] font-semibold leading-snug text-foreground">{title}</p>
        {subtitle ? (
          <p className="mt-0.5 text-[10px] font-medium text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5 px-3 py-2">{children}</div>
      {footer ? (
        <div className="border-t border-border/60 bg-muted/10 px-3 py-2">{footer}</div>
      ) : null}
    </div>
  );
}

function CompactMetaRow({
  icon: Icon,
  children,
}: {
  icon: typeof Mail;
  children: ReactNode;
}) {
  return (
    <p className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
      <Icon className="mt-0.5 size-3 shrink-0 text-muted-foreground/70" aria-hidden />
      <span className="min-w-0 break-all">{children}</span>
    </p>
  );
}

function CompactStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border/50 bg-background/80 px-2 py-1.5">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 truncate text-[11px] font-semibold tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}

function CustomerPopover({ order }: { order: Order }) {
  const name = order.users?.name ?? order.users?.email ?? "Guest";
  const userId = order.users?.id;
  const initials = customerInitials(name);
  const orderTotal = formatInr(Number(order.total_amount ?? 0));
  const orderDate = order.created_at
    ? format(new Date(order.created_at), "MMM d, yyyy · h:mm a")
    : "—";

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1 text-[13px] font-medium leading-snug text-foreground hover:text-primary hover:underline",
              ORDERS_ACCENT.focus,
            )}
          />
        }
      >
        {name}
        <ChevronDown className="size-3.5 opacity-50" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[17.5rem] gap-0 p-0">
        <CompactPopoverShell
          label="Customer"
          title={name}
          subtitle={`Order #${shortOrderRef(order.id)} · ${orderDate}`}
          footer={
            userId ? (
              <Link
                href={`/admin/customers/${userId}`}
                className="inline-flex text-[11px] font-semibold text-primary hover:underline"
              >
                View customer profile →
              </Link>
            ) : (
              <span className="text-[10px] text-muted-foreground">Guest checkout</span>
            )
          }
        >
          <div className="flex items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
              {initials}
            </span>
            <div className="flex min-w-0 flex-wrap gap-1">
              <PaymentPill paymentStatus={order.payment_status} />
              <FulfillmentPill status={order.status} />
              {isCustomerEditedOrder(order.customer_edited_at) ? (
                <CustomerEditedPill />
              ) : null}
            </div>
          </div>
          {order.users?.email ? (
            <CompactMetaRow icon={Mail}>{order.users.email}</CompactMetaRow>
          ) : null}
          {order.users?.phone ? (
            <CompactMetaRow icon={Phone}>{order.users.phone}</CompactMetaRow>
          ) : null}
          <CompactMetaRow icon={MapPin}>India</CompactMetaRow>
          <div className="grid grid-cols-2 gap-1.5">
            <CompactStat
              label="Lifetime orders"
              value={order.customer_order_count.toLocaleString("en-IN")}
            />
            <CompactStat label="This order" value={orderTotal} />
          </div>
          {order.merchant_note?.trim() ? (
            <p className="rounded-md border border-border/50 bg-muted/30 px-2 py-1.5 text-[10px] leading-snug text-muted-foreground">
              <span className="font-semibold text-foreground">Note · </span>
              {order.merchant_note.trim()}
            </p>
          ) : null}
        </CompactPopoverShell>
      </PopoverContent>
    </Popover>
  );
}

function ItemsPopover({
  order,
  detailBasePath,
}: {
  order: Order;
  detailBasePath: string;
}) {
  const count = order.item_count;
  const label = `${count} item${count === 1 ? "" : "s"}`;
  const total = formatInr(Number(order.total_amount ?? 0));
  const totalQty = order.order_items_preview.reduce(
    (sum, item) => sum + (item.quantity ?? 0),
    0,
  );

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground",
              ORDERS_ACCENT.focus,
            )}
          />
        }
      >
        {label}
        <ChevronDown className="size-3.5 opacity-50" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[17.5rem] gap-0 p-0">
        <CompactPopoverShell
          label="Line items"
          title={label}
          subtitle={`${totalQty || count} units · ${total}`}
          footer={
            <Link
              href={`${detailBasePath}/${order.id}`}
              className="inline-flex text-[11px] font-semibold text-primary hover:underline"
            >
              View full order →
            </Link>
          }
        >
          {order.order_items_preview.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No items on this order.</p>
          ) : (
            <ul className="max-h-44 space-y-0 overflow-y-auto">
              {order.order_items_preview.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start gap-2 border-b border-border/40 py-1.5 last:border-0"
                >
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-foreground">
                    {item.quantity ?? 1}×
                  </span>
                  <span className="min-w-0 flex-1 text-[11px] font-medium leading-snug text-foreground">
                    {item.product_name ?? "Item"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {order.merchant_note?.trim() ? (
            <p className="rounded-md border border-border/50 bg-muted/30 px-2 py-1.5 text-[10px] leading-snug text-muted-foreground">
              <span className="font-semibold text-foreground">Note · </span>
              {order.merchant_note.trim()}
            </p>
          ) : null}
        </CompactPopoverShell>
      </PopoverContent>
    </Popover>
  );
}
function exportOrdersCsv(orders: Order[]) {
  const headers = [
    "Order ID",
    "Customer",
    "Email",
    "Date",
    "Payment Status",
    "Fulfillment Status",
    "Items",
    "Total (INR)",
  ];

  const rows = orders.map((order) => [
    shortOrderRef(order.id),
    order.users?.name ?? "Guest",
    order.users?.email ?? "",
    order.created_at
      ? format(new Date(order.created_at), "yyyy-MM-dd HH:mm")
      : "",
    paymentStatusLabel(order.payment_status),
    order.status,
    String(order.item_count),
    String(Number(order.total_amount ?? 0)),
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
  link.download = `orders-export-${format(new Date(), "yyyy-MM-dd")}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function printShippingLabels(orderIds: string[]) {
  for (const id of orderIds) {
    window.open(`/admin/orders/${id}/invoice`, "_blank", "noopener,noreferrer");
  }
}

export function OrdersBulkActionBar({
  selectedIds,
  orders,
  onClearSelection,
  variant = "online",
}: {
  selectedIds: Set<string>;
  orders: Order[];
  onClearSelection: () => void;
  variant?: "online" | "erp";
}) {
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();

  const selectedOrders = useMemo(
    () => orders.filter((o) => selectedIds.has(o.id)),
    [orders, selectedIds],
  );

  if (selectedIds.size === 0) return null;

  return (
    <div className={cn("sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 backdrop-blur-sm", ORDERS_ACCENT.selectionBar)}>
      <p className="text-sm font-medium">
        {selectedIds.size} order{selectedIds.size === 1 ? "" : "s"} selected
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {variant === "online" ? (
          <>
            <Button
              size="sm"
              disabled={isPending}
              onClick={() => {
                startTransition(async () => {
                  await bulkUpdateOrderStatusAction(
                    Array.from(selectedIds),
                    "shipped",
                  );
                  void queryClient.invalidateQueries({
                    queryKey: ["admin", "orders"],
                  });
                  onClearSelection();
                });
              }}
            >
              <Truck data-icon="inline-start" />
              Mark as fulfilled
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => printShippingLabels(Array.from(selectedIds))}
            >
              <Printer data-icon="inline-start" />
              Print shipping labels
            </Button>
          </>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          onClick={() => exportOrdersCsv(selectedOrders)}
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

export { exportOrdersCsv };

export function OrdersDataTable({
  orders,
  selectedIds,
  onSelectedIdsChange,
  variant = "online",
  detailBasePath = "/admin/orders",
  outboxOperations,
}: {
  orders: Order[];
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
  variant?: "online" | "erp";
  detailBasePath?: string;
  outboxOperations?: OutboxOperationRecord[];
}) {
  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    orders,
    "created_at",
    "desc",
    (row, key) => {
      switch (key) {
        case "order_ref":
          return row.sales_order_number ?? row.id;
        case "customer_name":
          return row.users?.name ?? row.users?.email ?? "";
        case "reference_number":
          return row.reference_number ?? "";
        case "store_name":
          return row.store_name ?? "";
        case "payment_status":
          return row.payment_status ?? "";
        case "status":
          return row.status ?? "";
        case "item_count":
          return row.item_count ?? 0;
        case "total_amount":
          return Number(row.total_amount ?? 0);
        case "shipment_date":
          return row.shipment_date ?? "";
        default:
          return (row as unknown as Record<string, unknown>)[key];
      }
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

  const queued = variant === "erp" ? outboxOperations ?? [] : [];

  if (sorted.length === 0 && queued.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <Package className="size-10 text-muted-foreground/40" aria-hidden />
        <p className="text-sm text-muted-foreground">No orders in this view.</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-b border-border/60 hover:bg-transparent">
          <TableHead className="w-10">
            <Checkbox
              aria-label="Select all orders on this page"
              checked={allPageSelected}
              onCheckedChange={(checked) => toggleAllOnPage(checked === true)}
            />
          </TableHead>
          <SortableTableHead
            label={variant === "erp" ? "SO#" : "Order"}
            sortKey="order_ref"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
          />
          {variant === "erp" ? (
            <SortableTableHead
              label="Reference"
              sortKey="reference_number"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              className="hidden lg:table-cell"
            />
          ) : null}
          <SortableTableHead
            label="Customer"
            sortKey="customer_name"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
          />
          <SortableTableHead
            label="Date"
            sortKey="created_at"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
          />
          {variant === "erp" ? (
            <SortableTableHead
              label="Shipment"
              sortKey="shipment_date"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              className="hidden xl:table-cell"
            />
          ) : null}
          <SortableTableHead
            label="Store"
            sortKey="store_name"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
            className="hidden md:table-cell"
          />
          <SortableTableHead
            label="Payment"
            sortKey="payment_status"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
          />
          <SortableTableHead
            label={variant === "erp" ? "Status" : "Fulfillment"}
            sortKey="status"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
          />
          <SortableTableHead
            label="Items"
            sortKey="item_count"
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
        {queued.length > 0 ? (
          <SalesOrderOutboxTableRows
            operations={queued}
            detailBasePath={detailBasePath}
          />
        ) : null}
        {sorted.map((order) => {
          const isSelected = selectedIds.has(order.id);
          const total = Number(order.total_amount ?? 0);

          return (
            <TableRow
              key={order.id}
              data-state={isSelected ? "selected" : undefined}
              className={cn(
                "border-b border-border/60 hover:bg-muted/40",
                ORDERS_ACCENT.selectedRow,
              )}
            >
              <TableCell>
                <Checkbox
                  aria-label={`Select order ${shortOrderRef(order.id)}`}
                  checked={isSelected}
                  onCheckedChange={(checked) =>
                    toggleRow(order.id, checked === true)
                  }
                />
              </TableCell>
              <TableCell>
                <Link
                  href={`${detailBasePath}/${order.id}`}
                  className={cn(
                    "font-mono text-[13px] font-medium leading-snug text-foreground hover:text-primary hover:underline",
                  )}
                  title={
                    variant === "erp" && order.sales_order_number
                      ? order.sales_order_number
                      : undefined
                  }
                >
                  {variant === "erp"
                    ? formatErpDocRef("SO", order.id)
                    : order.sales_order_number
                      ? `SO-${order.sales_order_number}`
                      : `#${shortOrderRef(order.id)}`}
                </Link>
              </TableCell>
              {variant === "erp" ? (
                <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                  {order.reference_number ?? "—"}
                </TableCell>
              ) : null}
              <TableCell>
                <CustomerPopover order={order} />
              </TableCell>
              <TableCell className="text-[13px] text-muted-foreground">
                {order.created_at
                  ? format(new Date(order.created_at), "MMM d, yyyy")
                  : "—"}
              </TableCell>
              {variant === "erp" ? (
                <TableCell className="hidden text-[13px] text-muted-foreground xl:table-cell">
                  {order.shipment_date ?? "—"}
                </TableCell>
              ) : null}
              <TableCell className="hidden max-w-[120px] truncate text-sm text-muted-foreground md:table-cell">
                {order.store_name ?? "—"}
              </TableCell>
              <TableCell>
                <PaymentPill paymentStatus={order.payment_status} />
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-1">
                  <FulfillmentPill status={order.status} />
                  {variant !== "erp" ? (
                    <InventoryFulfillmentStatusPill
                      status={order.fulfillment_status}
                    />
                  ) : null}
                  {isCustomerEditedOrder(order.customer_edited_at) ? (
                    <CustomerEditedPill />
                  ) : null}
                </div>
              </TableCell>
              <TableCell>
                <ItemsPopover order={order} detailBasePath={detailBasePath} />
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
                        aria-label="Order actions"
                      />
                    }
                  >
                    <MoreHorizontal />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuGroup>
                      <DropdownMenuItem
                        nativeButton={false}
                        render={<Link href={`${detailBasePath}/${order.id}`} />}
                      >
                        View order
                      </DropdownMenuItem>
                      {variant === "online" ? (
                        <DropdownMenuItem
                          nativeButton={false}
                          render={
                            <Link
                              href={`/admin/orders/${order.id}/invoice`}
                              target="_blank"
                            />
                          }
                        >
                          Print invoice
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuItem onClick={() => exportOrdersCsv([order])}>
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
