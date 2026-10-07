"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";

import type { ErpStoreTransferListRow } from "@/common/erp/inventory-types";
import { PAGE_SIZE } from "@/common/admin/types";
import { adminListPath, useAdminGetQuery } from "@/modules/admin/lib/use-admin-get-query";
import { StatusBadge } from "@/modules/admin/components/status-badge";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { Pagination } from "@/modules/admin/components/pagination";
import { formatErpDocRef } from "@/lib/erp-document-ref";
import { Button } from "@/components/ui/button";
import { TableHead } from "@/components/ui/table";
import {
  AdminDataTable,
  AdminListCard,
  AdminListFooter,
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
  useDebouncedValue,
  useErpFormModal,
  useSortableData,
} from "@/modules/admin/ui";
import { useErpStores } from "@/modules/erp/components/use-erp-stores";
import { StoreTransferFormView } from "@/modules/admin/views/inventory/store-transfer-form-view";

export function StoreTransfersListView() {
  const searchParams = useSearchParams();
  const { activeStoreId, loading: erpContextLoading } = useErpStores();
  const { isOpen, modalProps, openNew } = useErpFormModal("/admin/erp/store-transfers");
  const requestId = searchParams.get("requestId") ?? undefined;
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const debouncedSearch = useDebouncedValue(search, 350);
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const listPath = adminListPath("erp/store-transfers", {
    page,
    search: debouncedSearch.trim() || undefined,
    storeId: activeStoreId,
  });
  const { data, isPending, refetch } = useAdminGetQuery<{
    data: ErpStoreTransferListRow[];
    total: number;
  }>({
    path: listPath,
    enabled: !erpContextLoading && Boolean(activeStoreId),
  });
  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    rows,
    "transfer_date",
    "desc",
  );

  const listParams: Record<string, string> = {};
  if (debouncedSearch.trim()) listParams.search = debouncedSearch.trim();

  if (isPending && !data) return <AdminPageSkeleton />;

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title="Store transfers"
        breadcrumb={[{ label: "Store transfers", href: "/admin/erp/store-transfers" }]}
        description="Completed stock movements between stores."
        actions={
          <Button size="sm" onClick={() => openNew()}>
            <Plus data-icon="inline-start" />
            Add new transfer
          </Button>
        }
      />

      <AdminListCard
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search transfer number…"
        isEmpty={sorted.length === 0}
        emptyMessage="No store transfers yet."
        isFiltering={Boolean(debouncedSearch.trim())}
        onClearFilters={() => {
          setSearch("");
        }}
        footer={<AdminListFooter total={total} label="transfers" page={page} pageSize={PAGE_SIZE} />}
      >
        <AdminDataTable>
          <AdminTableHeader>
            <SortableTableHead
              label="Number"
              sortKey="transfer_number"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="From"
              sortKey="from_store_name"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="To"
              sortKey="to_store_name"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Date"
              sortKey="transfer_date"
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
            <TableHead className="w-28 text-right" />
          </AdminTableHeader>
          <AdminTableBody>
            {sorted.map((r) => (
              <AdminTableRow key={r.id}>
                <AdminTableCell>
                  <AdminTableLink
                    href={`/admin/erp/store-transfers/${r.id}`}
                    title={r.transfer_number}
                  >
                    {formatErpDocRef("ST", r.id)}
                  </AdminTableLink>
                </AdminTableCell>
                <AdminTableCell>
                  <ErpStoreTableGlance storeId={r.from_store_id} name={r.from_store_name} />
                </AdminTableCell>
                <AdminTableCell>
                  <ErpStoreTableGlance storeId={r.to_store_id} name={r.to_store_name} />
                </AdminTableCell>
                <AdminTableCell>{r.transfer_date}</AdminTableCell>
                <AdminTableCell>
                  <StatusBadge status={r.status} />
                </AdminTableCell>
                <AdminTableCell align="right">
                  <ErpListRowActions viewHref={`/admin/erp/store-transfers/${r.id}`} />
                </AdminTableCell>
              </AdminTableRow>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      </AdminListCard>

      <Pagination
        total={total}
        page={page}
        basePath="/admin/erp/store-transfers"
        listParams={listParams}
      />

      {isOpen ? (
        <StoreTransferFormView
          variant="modal"
          requestId={requestId}
          open={modalProps.open}
          onOpenChange={modalProps.onOpenChange}
          onSuccess={() => void refetch()}
        />
      ) : null}
    </AdminPageLayout>
  );
}
