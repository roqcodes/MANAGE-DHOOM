"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BadgePercent, Plus, Scale } from "lucide-react";

import { DataExportMenu } from "@/components/export/data-export-menu";
import { buildCatalogExportSource, catalogFilterSubtitle } from "@/lib/export/catalog-export";
import { getCreditNotesExportTabular } from "@/lib/export/erp-sales-list-export";

import type { ErpCreditNoteListRow } from "@/common/erp/sales-types";
import { PAGE_SIZE } from "@/common/admin/types";
import { prefetchErpCreditNoteDetail } from "@/modules/admin/lib/admin-prefetch-nav";
import { adminListPath, useAdminGetQuery } from "@/modules/admin/lib/use-admin-get-query";
import { StatusBadge } from "@/modules/admin/components/status-badge";
import { Pagination } from "@/modules/admin/components/pagination";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { Badge } from "@/components/ui/badge";
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
  AdminTableRow,
  ErpCustomerTableGlance,
  ErpDocumentTableGlance,
  ErpStoreTableGlance,
  ErpListRowActions,
  SortableTableHead,
  AdminTableDateTime,
  useErpFormModal,
  useSortableData,
} from "@/modules/admin/ui";
import { creditKindLabel, formatCustomerCreditNoteRef } from "@/common/erp/commercial-discount";
import { CreditNoteFormView } from "@/modules/admin/views/sales/credit-note-form-view";
import { ErpCommercialDiscountFormView } from "@/modules/admin/views/erp/erp-commercial-discount-form-view";
import { ErpSettlementFormView } from "@/modules/admin/views/erp/erp-settlement-form-view";
import { useErpListState } from "@/modules/admin/ui/use-erp-list-state";
import { AddressHierarchyFilterInline } from "@/modules/customers/components/address-hierarchy-filter-fields";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "issued", label: "Issued" },
  { value: "applied", label: "Applied" },
  { value: "cancelled", label: "Cancelled" },
];

const KIND_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "return", label: "Returns (CN)" },
  { value: "discount", label: "Discounts (DC)" },
];

function creditNoteGlanceLabels(row: ErpCreditNoteListRow) {
  const isDiscount = row.credit_kind === "discount";
  return {
    shellLabel: isDiscount ? "Discount credit" : "Credit note",
    viewLabel: isDiscount ? "View discount →" : "View credit note →",
  };
}

export function CreditNotesListView() {
  const queryClient = useQueryClient();
  const { isOpen, mode, editId, modalProps, openNew } = useErpFormModal("/admin/erp/credit-notes");
  const [discountOpen, setDiscountOpen] = useState(false);
  const [settlementOpen, setSettlementOpen] = useState(false);
  const [creditKind, setCreditKind] = useState("all");
  const {
    search,
    setSearch,
    debouncedSearch,
    status,
    setStatus,
    storeId,
    page,
    listParams,
    dateFrom,
    dateTo,
    isFiltering: baseFiltering,
    clearFilters,
    erpContextLoading,
    addressFilterFields,
  } = useErpListState();

  const kindFilterActive = creditKind !== "all";
  const isFiltering = baseFiltering || kindFilterActive;

  const queryListParams = useMemo(() => {
    const params = { ...listParams };
    if (creditKind !== "all") params.creditKind = creditKind;
    return params;
  }, [listParams, creditKind]);

  const listPath = adminListPath("erp/credit-notes", { page, ...queryListParams });
  const { data, isPending, refetch } = useAdminGetQuery<{
    data: ErpCreditNoteListRow[];
    total: number;
  }>({
    path: listPath,
    enabled: !erpContextLoading,
  });
  const rows = data?.data ?? [];
  const initialLoading = isPending && !data;
  const total = data?.total ?? 0;
  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    rows,
    "credit_note_date",
    "desc",
  );

  const exportSource = useMemo(
    () =>
      buildCatalogExportSource({
        baseFilename: "credit-notes-export",
        title: "Credit notes",
        getSubtitle: () =>
          catalogFilterSubtitle({
            search: debouncedSearch,
            status,
            storeLabel: storeId ? "Selected store" : undefined,
            dateFrom,
            dateTo,
          }),
        getTabular: () => {
          const tabular = getCreditNotesExportTabular(sorted);
          return tabular.rows.length > 0 ? tabular : null;
        },
      }),
    [sorted, debouncedSearch, status, storeId, dateFrom, dateTo],
  );

  function handleClearFilters() {
    clearFilters();
    setCreditKind("all");
  }

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title="Credit notes"
        breadcrumb={[{ label: "Credit notes", href: "/admin/erp/credit-notes" }]}
        description="Customer returns (CN) and post-invoice discounts (DC). Filter by store, status, type, or date. Unapplied balance is available in account settlement."
        actions={
          <>
            <DataExportMenu source={exportSource} disabled={sorted.length === 0} />
            <Button
              variant="outline"
              size="page"
              className="rounded-full"
              onClick={() => setDiscountOpen(true)}
            >
              <BadgePercent data-icon="inline-start" />
              Record discount
            </Button>
            <Button
              variant="outline"
              size="page"
              className="rounded-full"
              onClick={() => setSettlementOpen(true)}
            >
              <Scale data-icon="inline-start" />
              Settle account
            </Button>
            <AdminPrimaryAction onClick={() => openNew()}>
              <Plus data-icon="inline-start" />
              Create return
            </AdminPrimaryAction>
          </>
        }
      />

      <AdminListCard
        isLoading={initialLoading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="CN/DC number or customer…"
        isEmpty={!initialLoading && sorted.length === 0}
        emptyMessage="No credit notes found."
        isFiltering={isFiltering}
        onClearFilters={handleClearFilters}
        addressFilters={
          <AddressHierarchyFilterInline {...addressFilterFields} />
        }
        filters={[
          {
            id: "status",
            label: "Status",
            value: status,
            options: STATUS_OPTIONS,
            onChange: setStatus,
          },
          {
            id: "creditKind",
            label: "Type",
            value: creditKind,
            options: KIND_OPTIONS,
            onChange: setCreditKind,
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
              label="Type"
              sortKey="credit_kind"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              className="hidden sm:table-cell"
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
          {initialLoading ? (
            <AdminDataTableRowsSkeleton rows={8} columns={8} />
          ) : (
            <AdminTableBody>
              {sorted.map((row) => {
                const glance = creditNoteGlanceLabels(row);
                return (
                  <AdminTableRow
                    key={row.id}
                    onMouseEnter={() => void prefetchErpCreditNoteDetail(queryClient, row.id)}
                  >
                    <AdminTableCell className="text-muted-foreground">
                      <AdminTableDateTime documentDate={row.credit_note_date} activity={row} />
                    </AdminTableCell>
                    <AdminTableCell>
                      <ErpDocumentTableGlance
                        triggerLabel={formatCustomerCreditNoteRef(row)}
                        shellLabel={glance.shellLabel}
                        title={formatCustomerCreditNoteRef(row)}
                        subtitle={row.customer_name ?? undefined}
                        viewHref={`/admin/erp/credit-notes/${row.id}`}
                        viewLabel={glance.viewLabel}
                        stats={[
                          { label: "Total", value: formatCurrencyAmount(row.total_amount) },
                          { label: "Remaining", value: formatCurrencyAmount(row.balance_remaining) },
                        ]}
                      />
                    </AdminTableCell>
                    <AdminTableCell className="hidden sm:table-cell">
                      <Badge variant={row.credit_kind === "discount" ? "secondary" : "outline"}>
                        {creditKindLabel(row.credit_kind)}
                      </Badge>
                    </AdminTableCell>
                    <AdminTableCell className="hidden max-w-[140px] md:table-cell">
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
                );
              })}
            </AdminTableBody>
          )}
        </AdminDataTable>
      </AdminListCard>

      <Pagination
        total={total}
        page={page}
        basePath="/admin/erp/credit-notes"
        listParams={queryListParams}
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

      {discountOpen ? (
        <ErpCommercialDiscountFormView
          side="customer"
          variant="modal"
          open={discountOpen}
          onOpenChange={setDiscountOpen}
          onSuccess={() => void refetch()}
        />
      ) : null}

      {settlementOpen ? (
        <ErpSettlementFormView
          side="customer"
          variant="modal"
          open={settlementOpen}
          onOpenChange={setSettlementOpen}
          onSuccess={() => void refetch()}
        />
      ) : null}
    </AdminPageLayout>
  );
}
