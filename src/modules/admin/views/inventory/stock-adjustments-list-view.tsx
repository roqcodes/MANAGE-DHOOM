"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";

import type { ErpStockAdjustmentListRow } from "@/common/erp/inventory-types";
import { PAGE_SIZE } from "@/common/admin/types";
import { adminListPath, useAdminGetQuery } from "@/modules/admin/lib/use-admin-get-query";
import { StatusBadge } from "@/modules/admin/components/status-badge";
import { Pagination } from "@/modules/admin/components/pagination";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { formatErpDocRef } from "@/lib/erp-document-ref";
import { Button } from "@/components/ui/button";
import { TableHead } from "@/components/ui/table";
import {
  AdminDataTable,
  AdminDataTableRowsSkeleton,
  AdminListCard,
  AdminListFooter,
  AdminPrimaryAction,
  AdminPageHeader,
  AdminPageLayout,
  AdminTableBody,
  AdminTableCell,
  AdminTableHeader,
  AdminTableLink,
  AdminTableRow,
  ErpStoreTableGlance,
  ErpListRowActions,
  SortableTableHead,
  AdminTableDateTime,
  useDebouncedValue,
  useErpFormModal,
  useSortableData,
} from "@/modules/admin/ui";
import { useActiveStoreScope } from "@/modules/erp/components/use-active-store-scope";
import { StockAdjustmentFormView } from "@/modules/admin/views/inventory/stock-adjustment-form-view";

export function StockAdjustmentsListView() {
  const searchParams = useSearchParams();
  const { storeId, erpContextLoading } = useActiveStoreScope();
  const { isOpen, modalProps, openNew } = useErpFormModal("/admin/erp/stock-adjustments");
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const debouncedSearch = useDebouncedValue(search, 350);
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const listPath = adminListPath("erp/stock-adjustments", {
    page,
    search: debouncedSearch.trim() || undefined,
    storeId,
  });
  const { data, isPending, refetch } = useAdminGetQuery<{
    data: ErpStockAdjustmentListRow[];
    total: number;
  }>({
    path: listPath,
    enabled: !erpContextLoading && Boolean(storeId),
  });
  const rows = data?.data ?? [];
  const initialLoading = isPending && !data;
  const total = data?.total ?? 0;
  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    rows,
    "adjustment_date",
    "desc",
  );

  const listParams: Record<string, string> = {};
  if (storeId) listParams.storeId = storeId;
  if (debouncedSearch.trim()) listParams.search = debouncedSearch.trim();
  return (
    <AdminPageLayout>
      <AdminPageHeader
        title="Stock adjustment"
        breadcrumb={[{ label: "Stock adjustment", href: "/admin/erp/stock-adjustments" }]}
        description="Manual stock corrections by store with cost impact for inventory valuation."
        actions={
          <AdminPrimaryAction onClick={() => openNew()}>
            <Plus data-icon="inline-start" />
            Add adjustment
          </AdminPrimaryAction>
        }
      />

      <AdminListCard isLoading={initialLoading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search adjustment number…"
        isEmpty={!initialLoading && (sorted.length === 0)}
        emptyMessage="No stock adjustments yet."
        isFiltering={Boolean(debouncedSearch.trim())}
        onClearFilters={() => {
          setSearch("");
        }}
        footer={
          <AdminListFooter total={total} label="adjustments" page={page} pageSize={PAGE_SIZE} />
        }
      >
        <AdminDataTable>
          <AdminTableHeader>
            <SortableTableHead
              label="Number"
              sortKey="adjustment_number"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Store"
              sortKey="store_name"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Date"
              sortKey="adjustment_date"
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
              label="Add cost"
              sortKey="total_add_cost"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              align="right"
            />
            <SortableTableHead
              label="Remove cost"
              sortKey="total_remove_cost"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              align="right"
            />
            <TableHead className="w-28 text-right" />
          </AdminTableHeader>
          {initialLoading ? (
            <AdminDataTableRowsSkeleton rows={8} columns={6} />
          ) : (
          <AdminTableBody>
            {sorted.map((r) => (
              <AdminTableRow key={r.id}>
                <AdminTableCell>
                  <AdminTableLink
                    href={`/admin/erp/stock-adjustments/${r.id}`}
                    title={r.adjustment_number}
                  >
                    {formatErpDocRef("SA", r.id)}
                  </AdminTableLink>
                </AdminTableCell>
                <AdminTableCell>
                  <ErpStoreTableGlance storeId={r.store_id} name={r.store_name} />
                </AdminTableCell>
                <AdminTableCell className="text-muted-foreground">
                  <AdminTableDateTime documentDate={r.adjustment_date} activity={r} />
                </AdminTableCell>
                <AdminTableCell>
                  <StatusBadge status={r.status} />
                </AdminTableCell>
                <AdminTableCell align="right" className="tabular-nums">
                  {formatCurrencyAmount(r.total_add_cost)}
                </AdminTableCell>
                <AdminTableCell align="right" className="tabular-nums">
                  {formatCurrencyAmount(r.total_remove_cost)}
                </AdminTableCell>
                <AdminTableCell align="right">
                  <ErpListRowActions viewHref={`/admin/erp/stock-adjustments/${r.id}`} />
                </AdminTableCell>
              </AdminTableRow>
            ))}
          </AdminTableBody>
          )}
        </AdminDataTable>
      </AdminListCard>

      <Pagination
        total={total}
        page={page}
        basePath="/admin/erp/stock-adjustments"
        listParams={listParams}
      />

      {isOpen ? (
        <StockAdjustmentFormView
          variant="modal"
          open={modalProps.open}
          onOpenChange={modalProps.onOpenChange}
          onSuccess={() => void refetch()}
        />
      ) : null}
    </AdminPageLayout>
  );
}
