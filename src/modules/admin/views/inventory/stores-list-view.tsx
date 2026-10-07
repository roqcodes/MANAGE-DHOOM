"use client";

import { useState } from "react";

import type { ErpStoreListRow } from "@/common/erp/inventory-types";
import { adminListPath, useAdminGetQuery } from "@/modules/admin/lib/use-admin-get-query";
import { StatusBadge } from "@/modules/admin/components/status-badge";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { Button } from "@/components/ui/button";
import { TableHead } from "@/components/ui/table";
import {
  AdminDataTable,
  AdminListCard,
  AdminPageHeader,
  AdminPageLayout,
  AdminTableBody,
  AdminTableCell,
  AdminTableHeader,
  AdminTableLink,
  AdminTableRow,
  ErpListRowActions,
  SortableTableHead,
  useDebouncedValue,
  useErpFormModal,
  useSortableData,
} from "@/modules/admin/ui";
import { StoreFormView } from "@/modules/admin/views/inventory/store-form-view";

export function StoresListView() {
  const { isOpen, mode, editId, modalProps, openNew } = useErpFormModal("/admin/erp/stores");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 350);
  const listPath = adminListPath("erp/stores", {
    search: debouncedSearch.trim() || undefined,
  });
  const { data, isPending, refetch } = useAdminGetQuery<{ data: ErpStoreListRow[] }>({
    path: listPath,
  });
  const rows = data?.data ?? [];
  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(rows, "name", "asc");

  if (isPending && !data) return <AdminPageSkeleton />;

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title="Stores"
        breadcrumb={[{ label: "Stores", href: "/admin/erp/stores" }]}
        description="Retail and warehouse locations used for inventory, sales, and purchases."
        actions={
          <Button size="sm" onClick={() => openNew()}>
            Add store
          </Button>
        }
      />

      <AdminListCard
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search stores…"
        isEmpty={sorted.length === 0}
        emptyMessage="No stores found. Add your first store to get started."
        isFiltering={Boolean(debouncedSearch.trim())}
        onClearFilters={() => setSearch("")}
        footer={<span>{sorted.length} stores</span>}
      >
        <AdminDataTable>
          <AdminTableHeader>
            <SortableTableHead
              label="Name"
              sortKey="name"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Type"
              sortKey="store_type"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Country"
              sortKey="country"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Currency"
              sortKey="currency"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Markup %"
              sortKey="markup_percent"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              align="right"
            />
            <SortableTableHead
              label="Status"
              sortKey="is_active"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <TableHead className="w-28 text-right" />
          </AdminTableHeader>
          <AdminTableBody>
            {sorted.map((r) => (
              <AdminTableRow key={r.id}>
                <AdminTableCell>
                  <AdminTableLink href={`/admin/erp/stores?form=edit&id=${r.id}`}>
                    {r.name}
                  </AdminTableLink>
                </AdminTableCell>
                <AdminTableCell>{r.store_type ?? "—"}</AdminTableCell>
                <AdminTableCell>{r.country ?? "—"}</AdminTableCell>
                <AdminTableCell>{r.currency ?? "—"}</AdminTableCell>
                <AdminTableCell align="right" className="tabular-nums">
                  {r.markup_percent}
                </AdminTableCell>
                <AdminTableCell>
                  <StatusBadge status={r.is_active ? "active" : "cancelled"} />
                </AdminTableCell>
                <AdminTableCell align="right">
                  <ErpListRowActions editHref={`/admin/erp/stores?form=edit&id=${r.id}`} />
                </AdminTableCell>
              </AdminTableRow>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      </AdminListCard>

      {isOpen ? (
        <StoreFormView
          variant="modal"
          storeId={mode === "edit" ? (editId ?? undefined) : undefined}
          open={modalProps.open}
          onOpenChange={modalProps.onOpenChange}
          onSuccess={() => void refetch()}
        />
      ) : null}
    </AdminPageLayout>
  );
}
