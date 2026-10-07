"use client";

import { useMemo } from "react";
import { Plus } from "lucide-react";

import type { ErpCreditNoteListRow } from "@/common/erp/sales-types";
import { PAGE_SIZE } from "@/common/admin/types";
import { adminListPath, useAdminGetQuery } from "@/modules/admin/lib/use-admin-get-query";
import { StatusBadge } from "@/modules/admin/components/status-badge";
import { Pagination } from "@/modules/admin/components/pagination";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { formatCurrencyAmount } from "@/lib/format-currency";
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
  AdminTableRow,
  ErpCustomerTableGlance,
  ErpDocumentTableGlance,
  ErpStoreTableGlance,
  ErpListRowActions,
  SortableTableHead,
  useErpFormModal,
  useSortableData,
} from "@/modules/admin/ui";
import { CreditNoteFormView } from "@/modules/admin/views/sales/credit-note-form-view";
import { useErpListState } from "@/modules/admin/ui/use-erp-list-state";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "issued", label: "Issued" },
  { value: "applied", label: "Applied" },
  { value: "cancelled", label: "Cancelled" },
];

export function CreditNotesListView() {
  const { isOpen, mode, editId, modalProps, openNew } = useErpFormModal("/admin/erp/credit-notes");
  const {
    search,
    setSearch,
    debouncedSearch,
    status,
    setStatus,
    storeId,
    setStoreId,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    page,
    listParams,
    isFiltering,
    clearFilters,
    activeStoreId,
    erpContextLoading,
  } = useErpListState();
  const listPath = adminListPath("erp/credit-notes", { page, ...listParams });
  const { data, isPending, refetch } = useAdminGetQuery<{
    data: ErpCreditNoteListRow[];
    total: number;
  }>({
    path: listPath,
    enabled: !erpContextLoading,
  });
  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    rows,
    "credit_note_date",
    "desc",
  );

  if (isPending && !data) return <AdminPageSkeleton />;

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title="Credit notes"
        breadcrumb={[{ label: "Credit notes", href: "/admin/erp/credit-notes" }]}
        description="Credit notes reduce invoice balances. Filter by status, store, or date."
        actions={
          <Button size="sm" onClick={() => openNew()}>
            <Plus data-icon="inline-start" />
            Create credit note
          </Button>
        }
      />

      <AdminListCard
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search credit note number…"
        isEmpty={sorted.length === 0}
        emptyMessage="No credit notes found."
        isFiltering={isFiltering}
        onClearFilters={clearFilters}
        dateRange={{
          from: dateFrom,
          to: dateTo,
          onFromChange: setDateFrom,
          onToChange: setDateTo,
        }}
        filters={[
          {
            id: "status",
            label: "Status",
            value: status,
            options: STATUS_OPTIONS,
            onChange: setStatus,
          },
        ]}
        footer={
          <AdminListFooter total={total} label="credit notes" page={page} pageSize={PAGE_SIZE} />
        }
      >
        <AdminDataTable>
          <AdminTableHeader>
            <SortableTableHead
              label="Date"
              sortKey="credit_note_date"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Number"
              sortKey="credit_note_number"
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
              className="hidden md:table-cell"
            />
            <SortableTableHead
              label="Customer"
              sortKey="customer_name"
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
              label="Amount"
              sortKey="total_amount"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              align="right"
            />
            <SortableTableHead
              label="Balance"
              sortKey="balance_remaining"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              align="right"
            />
            <TableHead className="w-28 text-right" />
          </AdminTableHeader>
          <AdminTableBody>
            {sorted.map((row) => (
              <AdminTableRow key={row.id}>
                <AdminTableCell className="text-muted-foreground">
                  {row.credit_note_date}
                </AdminTableCell>
                <AdminTableCell>
                  <ErpDocumentTableGlance
                    triggerLabel={formatErpDocRef("CN", row.id)}
                    shellLabel="Credit note"
                    title={row.credit_note_number?.trim() || formatErpDocRef("CN", row.id)}
                    subtitle={row.customer_name ?? undefined}
                    viewHref={`/admin/erp/credit-notes/${row.id}`}
                    viewLabel="View credit note →"
                    stats={[
                      { label: "Total", value: formatCurrencyAmount(row.total_amount) },
                      { label: "Remaining", value: formatCurrencyAmount(row.balance_remaining) },
                    ]}
                  />
                </AdminTableCell>
                <AdminTableCell className="hidden md:table-cell">
                  <ErpStoreTableGlance storeId={row.store_id} name={row.store_name} />
                </AdminTableCell>
                <AdminTableCell className="max-w-[180px]">
                  <ErpCustomerTableGlance userId={row.user_id} name={row.customer_name} />
                </AdminTableCell>
                <AdminTableCell>
                  <StatusBadge status={row.status} />
                </AdminTableCell>
                <AdminTableCell align="right" className="font-semibold tabular-nums">
                  {formatCurrencyAmount(row.total_amount)}
                </AdminTableCell>
                <AdminTableCell align="right" className="tabular-nums">
                  {formatCurrencyAmount(row.balance_remaining)}
                </AdminTableCell>
                <AdminTableCell align="right">
                  <ErpListRowActions
                    viewHref={`/admin/erp/credit-notes/${row.id}`}
                    editHref={
                      row.status === "draft"
                        ? `/admin/erp/credit-notes?form=edit&id=${row.id}`
                        : undefined
                    }
                    printHref={`/admin/erp/credit-notes/${row.id}/print`}
                  />
                </AdminTableCell>
              </AdminTableRow>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      </AdminListCard>

      <Pagination
        total={total}
        page={page}
        basePath="/admin/erp/credit-notes"
        listParams={listParams}
      />

      {isOpen ? (
        <CreditNoteFormView
          variant="modal"
          mode={mode}
          creditNoteId={editId ?? undefined}
          open={modalProps.open}
          onOpenChange={modalProps.onOpenChange}
          onSuccess={() => void refetch()}
        />
      ) : null}
    </AdminPageLayout>
  );
}
