"use client";

import Link from "next/link";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Copy,
  MoreHorizontal,
  Pencil,
  ToggleLeft,
  ToggleRight,
  Trash2,
  X,
} from "lucide-react";

import type { Vendor } from "@/common/admin/types";
import { invalidateAdminVendorCatalogQueries } from "@/modules/erp/lib/entity-live-search.client";
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
import { CatalogVendorTableGlance } from "@/modules/admin/ui";
import { useSortableData } from "@/lib/hooks/use-sortable-data";
import {
  bulkDeleteVendorsAction,
  bulkSetVendorsActiveAction,
  deleteVendorAction,
  toggleVendorAction,
} from "@/modules/vendors/actions/vendors.actions";
import {
  formatVendorId,
  VendorStatusBadge,
} from "@/modules/vendors/components/vendors-ui";
import { useAdminAction } from "@/modules/admin/hooks/use-admin-action";

export function exportVendorsCsv(vendors: Vendor[]) {
  const headers = ["Name", "ID", "Status", "Contact", "Created"];

  const rows = vendors.map((v) => [
    v.name ?? "",
    formatVendorId(v),
    v.is_active ? "Active" : "Inactive",
    v.contact ?? "",
    v.created_at ? format(new Date(v.created_at), "yyyy-MM-dd") : "",
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
  link.download = `vendors-export-${format(new Date(), "yyyy-MM-dd")}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function VendorsBulkActionBar({
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
        {selectedIds.size} vendor{selectedIds.size === 1 ? "" : "s"} selected
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={isPending}
          onClick={() => {
            runAction(async () => {
              await bulkSetVendorsActiveAction(ids, true);
              void invalidateAdminVendorCatalogQueries(queryClient);
              onClearSelection();
            });
          }}
        >
          Set as Active
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => {
            runAction(async () => {
              await bulkSetVendorsActiveAction(ids, false);
              void invalidateAdminVendorCatalogQueries(queryClient);
              onClearSelection();
            });
          }}
        >
          Set as Inactive
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={isPending}
          onClick={() => {
            runAction(async () => {
              await bulkDeleteVendorsAction(ids);
              void invalidateAdminVendorCatalogQueries(queryClient);
              onClearSelection();
            }, { errorTitle: "Couldn't delete vendors" });
          }}
        >
          <Trash2 data-icon="inline-start" />
          Delete selected
        </Button>
        <Button size="sm" variant="ghost" onClick={onClearSelection}>
          <X data-icon="inline-start" />
          Clear
        </Button>
      </div>
    </div>
  );
}

export function VendorsDataTable({
  vendors,
  selectedIds,
  onSelectedIdsChange,
  onEdit,
}: {
  vendors: Vendor[];
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
  onEdit: (vendor: Vendor) => void;
}) {
  const queryClient = useQueryClient();
  const { runAction, isPending } = useAdminAction();

  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    vendors,
    "name",
    "asc",
    (row, key) => {
      if (key === "is_active") return row.is_active ? 1 : 0;
      return (row as unknown as Record<string, unknown>)[key];
    },
  );

  const pageIds = sorted.map((v) => v.id);
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

  function runToggle(vendorId: string, isActive: boolean) {
    runAction(async () => {
      await toggleVendorAction(vendorId, isActive);
      void invalidateAdminVendorCatalogQueries(queryClient);
    });
  }

  function runDelete(vendorId: string) {
    runAction(async () => {
      await deleteVendorAction(vendorId);
      void invalidateAdminVendorCatalogQueries(queryClient);
    }, { errorTitle: "Couldn't delete vendor" });
  }

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <Building2 className="size-10 text-muted-foreground/40" aria-hidden />
        <p className="text-sm text-muted-foreground">No vendors in this view.</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-b border-border/60 hover:bg-transparent">
          <TableHead className="w-10">
            <Checkbox
              aria-label="Select all vendors on this page"
              checked={allPageSelected}
              onCheckedChange={(checked) => toggleAllOnPage(checked === true)}
            />
          </TableHead>
          <SortableTableHead
            label="Vendor"
            sortKey="name"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
          />
          <SortableTableHead
            label="Status"
            sortKey="is_active"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
          />
          <SortableTableHead
            label="Contact"
            sortKey="contact"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
          />
          <SortableTableHead
            label="Added"
            sortKey="created_at"
            activeKey={sortKey}
            direction={sortDirection}
            onSort={toggleSort}
          />
          <TableHead className="w-24 text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((vendor) => {
          const isSelected = selectedIds.has(vendor.id);
          const active = vendor.is_active === true;

          return (
            <TableRow
              key={vendor.id}
              data-state={isSelected ? "selected" : undefined}
              className="border-b border-border/60 hover:bg-muted/40 data-[state=selected]:bg-accent/60"
            >
              <TableCell>
                <Checkbox
                  aria-label={`Select ${vendor.name ?? "vendor"}`}
                  checked={isSelected}
                  onCheckedChange={(checked) =>
                    toggleRow(vendor.id, checked === true)
                  }
                />
              </TableCell>
              <TableCell>
                <div className="min-w-0">
                  <CatalogVendorTableGlance vendor={vendor} />
                  <p className="truncate text-[11px] text-muted-foreground">
                    {formatVendorId(vendor)}
                  </p>
                </div>
              </TableCell>
              <TableCell>
                <VendorStatusBadge vendor={vendor} />
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {vendor.contact?.trim() ? vendor.contact : "—"}
              </TableCell>
              <TableCell className="text-sm tabular-nums text-muted-foreground">
                {vendor.created_at
                  ? format(new Date(vendor.created_at), "MMM d, yyyy")
                  : "—"}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() => onEdit(vendor)}
                  >
                    <Pencil data-icon="inline-start" />
                    Edit
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Vendor actions"
                        />
                      }
                    >
                      <MoreHorizontal />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuGroup>
                        <DropdownMenuItem onClick={() => onEdit(vendor)}>
                          <Pencil />
                          Edit vendor
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          nativeButton={false}
                          render={
                            <Link href={`/admin/vendors/${vendor.id}`} />
                          }
                        >
                          <Copy />
                          View details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={isPending}
                          onClick={() => runToggle(vendor.id, !active)}
                        >
                          {active ? <ToggleRight /> : <ToggleLeft />}
                          {active ? "Deactivate" : "Activate"}
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          variant="destructive"
                          disabled={isPending}
                          onClick={() => runDelete(vendor.id)}
                        >
                          <Trash2 />
                          Delete
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
