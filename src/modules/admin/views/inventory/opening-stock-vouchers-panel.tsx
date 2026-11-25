"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

import type { ErpOpeningStockListRow } from "@/common/erp/inventory-types";
import { PAGE_SIZE } from "@/common/admin/types";
import { adminListPath, useAdminGetQuery } from "@/modules/admin/lib/use-admin-get-query";
import { StatusBadge } from "@/modules/admin/components/status-badge";
import { Pagination } from "@/modules/admin/components/pagination";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { formatErpDocRef } from "@/lib/erp-document-ref";
import { TableHead } from "@/components/ui/table";
import {
  AdminDataTable,
  AdminDataTableRowsSkeleton,
  AdminListCard,
  AdminListFooter,
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
  useSortableData,
} from "@/modules/admin/ui";
import { useActiveStoreScope } from "@/modules/erp/components/use-active-store-scope";

export function OpeningStockVouchersPanel() {
  const { storeId, erpContextLoading } = useActiveStoreScope();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 350);
  const searchParams = useSearchParams();
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const listPath = adminListPath("erp/opening-stock", {
    page,
    search: debouncedSearch.trim() || undefined,
    storeId,
  });
  const { data, isPending } = useAdminGetQuery<{
    data: ErpOpeningStockListRow[];
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
    "opening_date",
    "desc",
  );

  const listParams: Record<string, string> = { tab: "vouchers" };
  if (storeId) listParams.storeId = storeId;
  if (debouncedSearch.trim()) listParams.search = debouncedSearch.trim();

  return (
  <>
      <AdminListCard
        isLoading={initialLoading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search voucher number…"
        isEmpty={!initialLoading && sorted.length === 0}
        emptyMessage="No vouchers yet. Save items on the To enter tab."
        isFiltering={Boolean(debouncedSearch.trim())}
        onClearFilters={() => setSearch("")}
        footer={
          <AdminListFooter total={total} label="vouchers" page={page} pageSize={PAGE_SIZE} />
        }
      >
        <AdminDataTable>
          <AdminTableHeader>
            <SortableTableHead
              label="Number"
              sortKey="opening_number"
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
              label="As on"
              sortKey="opening_date"
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
              label="Total value"
              sortKey="total_value"
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
                      href={`/admin/erp/opening-stock/${r.id}`}
                      title={r.opening_number}
                    >
                      {r.opening_number || formatErpDocRef("OS", r.id)}
                    </AdminTableLink>
                  </AdminTableCell>
                  <AdminTableCell>
                    <ErpStoreTableGlance storeId={r.store_id} name={r.store_name} />
                  </AdminTableCell>
                  <AdminTableCell className="text-muted-foreground">
                    <AdminTableDateTime documentDate={r.opening_date} activity={r} />
                  </AdminTableCell>
                  <AdminTableCell>
                    <StatusBadge status={r.status} />
                  </AdminTableCell>
                  <AdminTableCell align="right" className="tabular-nums">
                    {formatCurrencyAmount(r.total_value)}
                  </AdminTableCell>
                  <AdminTableCell align="right">
                    <ErpListRowActions viewHref={`/admin/erp/opening-stock/${r.id}`} />
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
        basePath="/admin/erp/opening-stock"
        listParams={listParams}
      />
    </>
  );
}