"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Copy,
  MoreHorizontal,
  ShieldCheck,
  ShieldOff,
  Users,
  X,
} from "lucide-react";

import type { AdminUser } from "@/common/admin/types";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { Button } from "@/components/ui/button";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { CatalogCustomerTableGlance } from "@/modules/admin/ui";
import { useSortableData } from "@/lib/hooks/use-sortable-data";
import {
  blockUserAction,
  bulkBlockUsersAction,
  bulkUnblockUsersAction,
  unblockUserAction,
} from "@/modules/users/actions/users.actions";
import {
  CustomerStatusBadge,
  formatCreditLimit,
  formatCustomerId,
  isCustomerBlocked,
} from "@/modules/customers/components/customers-ui";
import { useAdminAction } from "@/modules/admin/hooks/use-admin-action";

export function exportCustomersCsv(users: AdminUser[]) {
  const headers = [
    "Number",
    "Name",
    "Company",
    "Email",
    "Mobile",
    "Location",
    "Receivables",
    "Credit Limit",
    "Orders",
    "Status",
    "Joined",
  ];

  const rows = users.map((u) => [
    formatCustomerId(u),
    u.name ?? "",
    u.company_name ?? "",
    u.email ?? "",
    u.phone ?? "",
    u.location ?? "",
    String(u.receivables ?? 0),
    u.credit_limit != null ? String(u.credit_limit) : "",
    String(u.order_count ?? 0),
    isCustomerBlocked(u) ? "Blocked" : "Active",
    u.created_at ? format(new Date(u.created_at), "yyyy-MM-dd") : "",
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
  link.download = `customers-export-${format(new Date(), "yyyy-MM-dd")}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function CustomersBulkActionBar({
  selectedIds,
  onClearSelection,
}: {
  selectedIds: Set<string>;
  onClearSelection: () => void;
}) {
  const queryClient = useQueryClient();
  const { runAction, isPending } = useAdminAction();

  if (selectedIds.size === 0) return null;

  const ids = Array.from(selectedIds);

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-accent/50 px-3 py-2 backdrop-blur-sm">
      <p className="text-sm font-medium">
        {selectedIds.size} customer{selectedIds.size === 1 ? "" : "s"} selected
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={isPending}
          onClick={() => {
            runAction(async () => {
              await bulkUnblockUsersAction(ids);
              void queryClient.invalidateQueries({ queryKey: ["admin", "customers"] });
              onClearSelection();
            });
          }}
        >
          Unblock selected
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={isPending}
          onClick={() => {
            runAction(async () => {
              await bulkBlockUsersAction(ids);
              void queryClient.invalidateQueries({ queryKey: ["admin", "customers"] });
              onClearSelection();
            });
          }}
        >
          <ShieldOff data-icon="inline-start" />
          Block selected
        </Button>
        <Button size="sm" variant="ghost" onClick={onClearSelection}>
          <X data-icon="inline-start" />
          Clear
        </Button>
      </div>
    </div>
  );
}

function EmailCell({ email, userId }: { email: string | null; userId: string }) {
  const [copied, setCopied] = useState(false);

  if (!email?.trim()) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <span className="truncate text-sm text-muted-foreground">{email}</span>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Copy email"
        onClick={() => {
          void navigator.clipboard.writeText(email);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? <Check className="text-emerald-600" /> : <Copy />}
      </Button>
    </div>
  );
}

export function CustomersDataTable({
  users,
  selectedIds,
  onSelectedIdsChange,
}: {
  users: AdminUser[];
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
}) {
  const queryClient = useQueryClient();
  const { runAction, isPending } = useAdminAction();

  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    users,
    "name",
    "asc",
    (row, key) => {
      switch (key) {
        case "customer_number":
          return row.customer_number ?? row.id;
        case "status":
          return isCustomerBlocked(row) ? 1 : 0;
        default:
          return (row as unknown as Record<string, unknown>)[key];
      }
    },
  );

  const pageIds = sorted.map((u) => u.id);
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

  function runBlock(userId: string, block: boolean) {
    runAction(async () => {
      if (block) await blockUserAction(userId);
      else await unblockUserAction(userId);
      void queryClient.invalidateQueries({ queryKey: ["admin", "customers"] });
    });
  }

  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <Users className="size-10 text-muted-foreground/40" aria-hidden />
        <p className="text-sm text-muted-foreground">No customers in this view.</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-b border-border/60 hover:bg-transparent">
          <TableHead className="w-10">
            <Checkbox
              aria-label="Select all customers on this page"
              checked={allPageSelected}
              onCheckedChange={(checked) => toggleAllOnPage(checked === true)}
            />
          </TableHead>
          <SortableTableHead
            label="Number"
            sortKey="customer_number"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
            className="w-20"
          />
          <SortableTableHead
            label="Customer"
            sortKey="name"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
          />
          <SortableTableHead
            label="Company"
            sortKey="company_name"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
            className="hidden md:table-cell"
          />
          <SortableTableHead
            label="Email"
            sortKey="email"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
          />
          <SortableTableHead
            label="Mobile"
            sortKey="phone"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
            className="hidden sm:table-cell"
          />
          <SortableTableHead
            label="Location"
            sortKey="location"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
            className="hidden lg:table-cell"
          />
          <SortableTableHead
            label="Receivables"
            sortKey="receivables"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
            align="right"
            className="hidden md:table-cell"
          />
          <SortableTableHead
            label="Credit limit"
            sortKey="credit_limit"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
            align="right"
            className="hidden xl:table-cell"
          />
          <SortableTableHead
            label="Status"
            sortKey="status"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
          />
          <TableHead className="w-24 text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((user) => {
          const isSelected = selectedIds.has(user.id);
          const blocked = isCustomerBlocked(user);

          return (
            <TableRow
              key={user.id}
              data-state={isSelected ? "selected" : undefined}
              className="border-b border-border/60 hover:bg-muted/40 data-[state=selected]:bg-accent/60"
            >
              <TableCell>
                <Checkbox
                  aria-label={`Select ${user.name ?? "customer"}`}
                  checked={isSelected}
                  onCheckedChange={(checked) =>
                    toggleRow(user.id, checked === true)
                  }
                />
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {formatCustomerId(user)}
              </TableCell>
              <TableCell>
                <CatalogCustomerTableGlance user={user} />
              </TableCell>
              <TableCell className="hidden max-w-[160px] truncate text-sm text-muted-foreground md:table-cell">
                {user.company_name?.trim() ? user.company_name : "—"}
              </TableCell>
              <TableCell className="max-w-[220px]">
                <EmailCell email={user.email} userId={user.id} />
              </TableCell>
              <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                {user.phone?.trim() ? user.phone : "—"}
              </TableCell>
              <TableCell className="hidden max-w-[140px] truncate text-sm text-muted-foreground lg:table-cell">
                {user.location?.trim() ? user.location : "—"}
              </TableCell>
              <TableCell className="hidden text-right text-sm tabular-nums md:table-cell">
                {formatCurrencyAmount(user.receivables ?? 0)}
              </TableCell>
              <TableCell className="hidden text-right text-sm xl:table-cell">
                {formatCreditLimit(user.credit_limit)}
              </TableCell>
              <TableCell>
                <CustomerStatusBadge user={user} />
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Customer actions"
                        />
                      }
                    >
                      <MoreHorizontal />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          nativeButton={false}
                          render={<Link href={`/admin/customers/${user.id}`} />}
                        >
                          View details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={isPending}
                          onClick={() => runBlock(user.id, !blocked)}
                        >
                          {blocked ? <ShieldCheck /> : <ShieldOff />}
                          {blocked ? "Unblock" : "Block"}
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          nativeButton={false}
                          render={<Link href={`/admin/customers?form=edit&id=${user.id}`} />}
                        >
                          Edit customer
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          nativeButton={false}
                          render={
                            <Link href={`/admin/erp/invoices?form=new&customerId=${user.id}`} />
                          }
                        >
                          New invoice
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          nativeButton={false}
                          render={
                            <Link href={`/admin/orders?userId=${user.id}`} />
                          }
                        >
                          View orders
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
