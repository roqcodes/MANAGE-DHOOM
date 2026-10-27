"use client";

import { useMemo, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { DataExportMenu } from "@/components/export/data-export-menu";
import { buildCatalogExportSource, catalogFilterSubtitle } from "@/lib/export/catalog-export";
import { getInvoicesExportTabular } from "@/lib/export/erp-sales-list-export";

import type { ErpInvoiceListRow } from "@/common/erp/sales-types";
import {
  ERP_DOCUMENT_UI,
  isSalesInvoiceDraft,
  salesInvoiceStatusForBadge,
} from "@/common/erp/document-status";
import { adminDelete } from "@/modules/admin/lib/admin-api-client";
import { prefetchErpInvoiceDetail } from "@/modules/admin/lib/admin-prefetch-nav";
import { adminListPath, useAdminGetQuery } from "@/modules/admin/lib/use-admin-get-query";
import { StatusBadge } from "@/modules/admin/components/status-badge";
import { Pagination } from "@/modules/admin/components/pagination";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { formatDateOnly } from "@/lib/format-date";
import { formatErpDocRef } from "@/lib/erp-document-ref";
import { Button } from "@/components/ui/button";
import { ErpPostActionButton } from "@/modules/erp/components/erp-post-action-button";
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
import { InvoiceFormView } from "@/modules/admin/views/sales/invoice-form-view";
import { enqueueSalesInvoiceIssue } from "@/modules/erp/lib/enqueue-sales-invoice-issue.client";
import { AppErrorCalloutMessage } from "@/modules/feedback/components/app-error-callout";
import { useErpInvoicePrintModal } from "@/modules/erp/components/use-erp-invoice-print-modal";
import { InvoiceChannelBadge } from "@/modules/erp/components/invoice-channel-badge";
import { TableHead } from "@/components/ui/table";
import { useErpListState } from "@/modules/admin/ui/use-erp-list-state";
import { PAGE_SIZE } from "@/common/admin/types";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "issued", label: "Issued" },
  { value: "partial", label: "Partial" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "cancelled", label: "Cancelled" },
];

export function InvoicesListView() {
  const queryClient = useQueryClient();
  const { isOpen, mode, editId, modalProps, openNew } = useErpFormModal("/admin/erp/invoices");
  const { openInvoicePrint } = useErpInvoicePrintModal();
  const {
    search,
    setSearch,
    debouncedSearch,
    status,
    setStatus,
    storeId,
    setStoreId,
    page,
    listParams,
    dateFrom,
    dateTo,
    isFiltering,
    clearFilters,
    activeStoreId,
    erpContextLoading,
  } = useErpListState();
  const listPath = adminListPath("erp/invoices", { page, ...listParams });
  const { data, isPending, refetch } = useAdminGetQuery<{
    data: ErpInvoiceListRow[];
    total: number;
  }>({
    path: listPath,
    enabled: !erpContextLoading,
  });
  const rows = data?.data ?? [];
  const initialLoading = isPending && !data;
  const total = data?.total ?? 0;
  const [cancellingId, startCancel] = useTransition();
  const [issuingId, setIssuingId] = useState<string | null>(null);
  const [issueError, setIssueError] = useState<string | null>(null);
  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    rows,
    "created_at",
    "desc",
  );

  const exportSource = useMemo(
    () =>
      buildCatalogExportSource({
        baseFilename: "invoices-export",
        title: "Invoices",
        getSubtitle: () =>
          catalogFilterSubtitle({
            search: debouncedSearch,
            status,
            storeLabel: storeId ? "Selected store" : undefined,
            dateFrom,
            dateTo,
          }),
        getTabular: () => {
          const tabular = getInvoicesExportTabular(sorted);
          return tabular.rows.length > 0 ? tabular : null;
        },
      }),
    [sorted, debouncedSearch, status, storeId, dateFrom, dateTo],
  );

  function cancelInvoice(invoiceId: string) {
    startCancel(async () => {
      await adminDelete(`erp/invoices/${invoiceId}`);
      await refetch();
    });
  }

  function issueDraftInvoice(row: ErpInvoiceListRow) {
    const storeId = row.store_id;
    if (!storeId) {
      setIssueError("Invoice store is missing.");
      return;
    }
    setIssueError(null);
    setIssuingId(row.id);
    void (async () => {
      try {
        await enqueueSalesInvoiceIssue({ invoiceId: row.id, storeId });
        await refetch();
      } catch (err) {
        setIssueError(err instanceof Error ? err.message : "Finalize failed");
      } finally {
        setIssuingId(null);
      }
    })();
  }
  return (
    <AdminPageLayout>
      <AdminPageHeader
        title="Invoices"
        breadcrumb={[{ label: "Invoices", href: "/admin/erp/invoices" }]}
        description="Store and online invoices with payment status. Use filters to narrow by store, status, or date range."
        actions={
          <>
            <DataExportMenu source={exportSource} disabled={sorted.length === 0} />
            <AdminPrimaryAction onClick={() => openNew()}>
              <Plus data-icon="inline-start" />
              Create invoice
            </AdminPrimaryAction>
          </>
        }
      />

      {issueError ? (
        <AppErrorCalloutMessage message={issueError} onRetry={() => setIssueError(null)} />
      ) : null}

      <AdminListCard isLoading={initialLoading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Invoice number or customer…"
        isEmpty={!initialLoading && (sorted.length === 0)}
        emptyMessage="No invoices found."
        isFiltering={isFiltering}
        onClearFilters={clearFilters}
        filters={[
          {
            id: "status",
            label: "Status",
            value: status,
            options: STATUS_OPTIONS,
            onChange: setStatus,
          },
        ]}
        footer={<AdminListFooter total={total} label="invoices" page={page} pageSize={PAGE_SIZE} />}
      >
        <AdminDataTable>
          <AdminTableHeader>
            <SortableTableHead
              label="Date"
              sortKey="created_at"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Number"
              sortKey="invoice_number"
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
              label="Channel"
              sortKey="source"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              className="hidden sm:table-cell"
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
              label="Due"
              sortKey="due_date"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              className="hidden lg:table-cell"
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
              sortKey="balance_due"
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
            {sorted.map((row) => (
              <AdminTableRow
                key={row.id}
                onMouseEnter={() => void prefetchErpInvoiceDetail(queryClient, row.id)}
              >
                <AdminTableCell className="text-muted-foreground">
                  <AdminTableDateTime at={row.created_at} activity={row} />
                </AdminTableCell>
                <AdminTableCell>
                  <ErpDocumentTableGlance
                    triggerLabel={formatErpDocRef("INV", row.id)}
                    shellLabel="Invoice"
                    title={row.invoice_number?.trim() || formatErpDocRef("INV", row.id)}
                    subtitle={row.customer_name ?? undefined}
                    viewHref={`/admin/erp/invoices/${row.id}`}
                    viewLabel="View invoice →"
                    stats={[
                      { label: "Total", value: formatCurrencyAmount(row.total_amount) },
                      { label: "Balance", value: formatCurrencyAmount(row.balance_due) },
                    ]}
                  />
                </AdminTableCell>
                <AdminTableCell className="hidden max-w-[140px] md:table-cell">
                  <ErpStoreTableGlance storeId={row.store_id} name={row.store_name} />
                </AdminTableCell>
                <AdminTableCell className="hidden sm:table-cell">
                  <InvoiceChannelBadge source={row.source} />
                </AdminTableCell>
                <AdminTableCell className="max-w-[180px]">
                  <ErpCustomerTableGlance userId={row.user_id} name={row.customer_name} />
                </AdminTableCell>
                <AdminTableCell>
                  <StatusBadge status={salesInvoiceStatusForBadge(row.status)} />
                </AdminTableCell>
                <AdminTableCell className="hidden text-muted-foreground lg:table-cell">
                  {formatDateOnly(row.due_date)}
                </AdminTableCell>
                <AdminTableCell align="right" className="font-semibold tabular-nums">
                  {formatCurrencyAmount(row.total_amount)}
                </AdminTableCell>
                <AdminTableCell align="right">
                  {isSalesInvoiceDraft(row.status) ? (
                    <ErpPostActionButton
                      size="sm"
                      className="h-8 shrink-0 px-2.5 text-xs"
                      disabled={issuingId === row.id}
                      onClick={() => issueDraftInvoice(row)}
                    >
                      {issuingId === row.id
                        ? ERP_DOCUMENT_UI.finalizing
                        : ERP_DOCUMENT_UI.salesInvoice.finalizeList}
                    </ErpPostActionButton>
                  ) : (
                    <span className="font-semibold tabular-nums">
                      {formatCurrencyAmount(row.balance_due)}
                    </span>
                  )}
                </AdminTableCell>
                <AdminTableCell align="right">
                    <ErpListRowActions
                    viewHref={`/admin/erp/invoices/${row.id}`}
                    editHref={`/admin/erp/invoices?form=edit&id=${row.id}`}
                    editDisabled={
                      !isSalesInvoiceDraft(row.status) ||
                      row.amount_paid > 0 ||
                      row.credits_applied > 0 ||
                      row.status === "cancelled"
                    }
                    onPrintClick={() => openInvoicePrint(row.id)}
                    menuItems={[
                      ...(row.status !== "cancelled" && row.balance_due > 0
                        ? [
                            {
                              label: "Add payment",
                              href: `/admin/erp/payments/new?invoiceId=${encodeURIComponent(row.id)}`,
                            },
                          ]
                        : []),
                      {
                        label: "Cancel invoice",
                        destructive: true,
                        separatorBefore: true,
                        disabled:
                          Boolean(cancellingId) ||
                          row.amount_paid > 0 ||
                          row.credits_applied > 0 ||
                          row.status === "cancelled",
                        onClick: () => cancelInvoice(row.id),
                      },
                    ]}
                  />
                </AdminTableCell>
              </AdminTableRow>
            ))}
          </AdminTableBody>
          )}
        </AdminDataTable>
      </AdminListCard>

      <Pagination total={total} page={page} basePath="/admin/erp/invoices" listParams={listParams} />

      {isOpen ? (
        <InvoiceFormView
          variant="modal"
          mode={mode}
          invoiceId={editId ?? undefined}
          open={modalProps.open}
          onOpenChange={modalProps.onOpenChange}
          onSuccess={() => void refetch()}
        />
      ) : null}

    </AdminPageLayout>
  );
}
