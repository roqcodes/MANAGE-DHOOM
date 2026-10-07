"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Clock,
  Copy,
  MoreHorizontal,
  Pencil,
  ShieldCheck,
  ShieldOff,
  Users,
  X,
} from "lucide-react";

import type { AdminUser, DBUser } from "@/common/admin/types";
import {
  rejectUserAction,
  verifyUserAction,
} from "@/modules/admin/actions/admin-users.actions";
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
import { useSortableData } from "@/lib/hooks/use-sortable-data";
import {
  blockUserAction,
  bulkBlockUsersAction,
  bulkUnblockUsersAction,
  unblockUserAction,
} from "@/modules/users/actions/users.actions";
import {
  formatUserId,
  isUserBlocked,
  UserRoleBadge,
  UserStatusBadge,
} from "@/modules/users/components/users-ui";

function EmailCell({ email }: { email: string | null }) {
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

export function exportStoresUsersCsv(users: AdminUser[]) {
  const headers = ["Name", "ID", "Email", "Phone", "Orders", "Status", "Joined"];
  const rows = users.map((u) => [
    u.name ?? "",
    formatUserId(u),
    u.email ?? "",
    u.phone ?? "",
    String(u.order_count ?? 0),
    isUserBlocked(u) ? "Blocked" : "Active",
    u.created_at ? format(new Date(u.created_at), "yyyy-MM-dd") : "",
  ]);
  downloadCsv("users-stores-export", headers, rows);
}

export function exportPortalUsersCsv(users: DBUser[], segment: string) {
  const headers = ["Name", "ID", "Email", "Phone", "Role", "Joined"];
  const rows = users.map((u) => [
    u.name ?? "",
    formatUserId(u),
    u.email ?? "",
    u.phone ?? "",
    u.role ?? "",
    u.created_at ? format(new Date(u.created_at), "yyyy-MM-dd") : "",
  ]);
  downloadCsv(`users-${segment}-export`, headers, rows);
}

export function exportPendingUsersCsv(users: DBUser[]) {
  const headers = ["Name", "ID", "Email", "Requested Role", "Joined"];
  const rows = users.map((u) => [
    u.name ?? "",
    formatUserId(u),
    u.email ?? "",
    u.role ?? "",
    u.created_at ? format(new Date(u.created_at), "yyyy-MM-dd") : "",
  ]);
  downloadCsv("users-requests-export", headers, rows);
}

function downloadCsv(prefix: string, headers: string[], rows: string[][]) {
  const csv = [headers, ...rows]
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
    )
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${prefix}-${format(new Date(), "yyyy-MM-dd")}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function StoresBulkActionBar({
  selectedIds,
  onClearSelection,
}: {
  selectedIds: Set<string>;
  onClearSelection: () => void;
}) {
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();

  if (selectedIds.size === 0) return null;

  const ids = Array.from(selectedIds);

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-accent/50 px-3 py-2 backdrop-blur-sm">
      <p className="text-sm font-medium">
        {selectedIds.size} user{selectedIds.size === 1 ? "" : "s"} selected
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              await bulkUnblockUsersAction(ids);
              void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
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
            startTransition(async () => {
              await bulkBlockUsersAction(ids);
              void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
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

export function StoresUsersDataTable({
  users,
  selectedIds,
  onSelectedIdsChange,
}: {
  users: AdminUser[];
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
}) {
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();

  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    users,
    "name",
    "asc",
    (row, key) => {
      switch (key) {
        case "status":
          return isUserBlocked(row) ? 1 : 0;
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
    startTransition(async () => {
      if (block) await blockUserAction(userId);
      else await unblockUserAction(userId);
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    });
  }

  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <Users className="size-10 text-muted-foreground/40" aria-hidden />
        <p className="text-sm text-muted-foreground">No store users in this view.</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-b border-border/60 hover:bg-transparent">
          <TableHead className="w-10">
            <Checkbox
              aria-label="Select all users on this page"
              checked={allPageSelected}
              onCheckedChange={(checked) => toggleAllOnPage(checked === true)}
            />
          </TableHead>
          <SortableTableHead
            label="User"
            sortKey="name"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
          />
          <SortableTableHead
            label="Email"
            sortKey="email"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
          />
          <SortableTableHead
            label="Phone"
            sortKey="phone"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
          />
          <SortableTableHead
            label="Orders"
            sortKey="order_count"
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
          <TableHead className="w-24 text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((user) => {
          const isSelected = selectedIds.has(user.id);
          const blocked = isUserBlocked(user);

          return (
            <TableRow
              key={user.id}
              data-state={isSelected ? "selected" : undefined}
              className="border-b border-border/60 hover:bg-muted/40 data-[state=selected]:bg-accent/60"
            >
              <TableCell>
                <Checkbox
                  aria-label={`Select ${user.name ?? "user"}`}
                  checked={isSelected}
                  onCheckedChange={(checked) =>
                    toggleRow(user.id, checked === true)
                  }
                />
              </TableCell>
              <TableCell>
                <div className="min-w-0">
                  <Link
                    href={`/admin/customers/${user.id}`}
                    className="text-[13px] font-medium leading-snug text-foreground hover:text-primary hover:underline"
                  >
                    {user.name ?? "Unnamed user"}
                  </Link>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {formatUserId(user)}
                    {user.created_at
                      ? ` · Joined ${format(new Date(user.created_at), "MMM d, yyyy")}`
                      : ""}
                  </p>
                </div>
              </TableCell>
              <TableCell className="max-w-[220px]">
                <EmailCell email={user.email} />
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {user.phone?.trim() ? user.phone : "—"}
              </TableCell>
              <TableCell className="text-sm tabular-nums">
                {(user.order_count ?? 0).toLocaleString("en-IN")}
              </TableCell>
              <TableCell>
                <UserStatusBadge user={user} />
              </TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="User actions"
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
                        render={<Link href={`/admin/orders?userId=${user.id}`} />}
                      >
                        View orders
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

export function PortalStaffDataTable({
  users,
  onEditRole,
}: {
  users: DBUser[];
  onEditRole: (user: DBUser) => void;
}) {
  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    users,
    "name",
    "asc",
  );

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <Users className="size-10 text-muted-foreground/40" aria-hidden />
        <p className="text-sm text-muted-foreground">No portal staff in this view.</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-b border-border/60 hover:bg-transparent">
          <SortableTableHead
            label="User"
            sortKey="name"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
          />
          <SortableTableHead
            label="Email"
            sortKey="email"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
          />
          <SortableTableHead
            label="Role"
            sortKey="role"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
          />
          <SortableTableHead
            label="Joined"
            sortKey="created_at"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
          />
          <TableHead className="w-24 text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((user) => (
          <TableRow
            key={user.id}
            className="border-b border-border/60 hover:bg-muted/40"
          >
            <TableCell>
              <div className="min-w-0">
                <p className="text-[13px] font-medium leading-snug">
                  {user.name ?? "Unknown user"}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {formatUserId(user)}
                </p>
              </div>
            </TableCell>
            <TableCell className="max-w-[220px]">
              <EmailCell email={user.email} />
            </TableCell>
            <TableCell>
              <UserRoleBadge role={user.role} />
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {user.created_at
                ? format(new Date(user.created_at), "MMM d, yyyy")
                : "—"}
            </TableCell>
            <TableCell className="text-right">
              <Button size="sm" variant="ghost" onClick={() => onEditRole(user)}>
                <Pencil data-icon="inline-start" />
                Change role
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function AccessRequestsDataTable({
  users,
  onEditRole,
}: {
  users: DBUser[];
  onEditRole: (user: DBUser) => void;
}) {
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();

  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    users,
    "created_at",
    "desc",
  );

  function runVerify(userId: string) {
    startTransition(async () => {
      await verifyUserAction(userId);
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    });
  }

  function runReject(userId: string) {
    startTransition(async () => {
      await rejectUserAction(userId);
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    });
  }

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <Clock className="size-10 text-muted-foreground/40" aria-hidden />
        <p className="text-sm text-muted-foreground">No pending access requests.</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-b border-border/60 hover:bg-transparent">
          <SortableTableHead
            label="User"
            sortKey="name"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
          />
          <SortableTableHead
            label="Email"
            sortKey="email"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
          />
          <SortableTableHead
            label="Requested role"
            sortKey="role"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
          />
          <SortableTableHead
            label="Requested"
            sortKey="created_at"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
          />
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((user) => (
          <TableRow
            key={user.id}
            className="border-b border-border/60 hover:bg-muted/40"
          >
            <TableCell>
              <div className="min-w-0">
                <p className="text-[13px] font-medium leading-snug">
                  {user.name ?? "Unknown user"}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {formatUserId(user)}
                </p>
              </div>
            </TableCell>
            <TableCell className="max-w-[220px]">
              <EmailCell email={user.email} />
            </TableCell>
            <TableCell>
              <UserRoleBadge role={user.role} />
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {user.created_at
                ? format(new Date(user.created_at), "MMM d, yyyy")
                : "—"}
            </TableCell>
            <TableCell>
              <div className="flex items-center justify-end gap-1">
                <Button
                  size="sm"
                  disabled={isPending}
                  onClick={() => runVerify(user.id)}
                >
                  <Check data-icon="inline-start" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => onEditRole(user)}
                >
                  <Pencil data-icon="inline-start" />
                  Role
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={isPending}
                  onClick={() => runReject(user.id)}
                >
                  Reject
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
