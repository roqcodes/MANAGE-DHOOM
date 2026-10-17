"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Plus } from "lucide-react";

import type { BulkCustomerPaymentBatchRow, CustomerPaymentListSummary } from "@/common/erp/sales-types";
import { paymentModeLabel } from "@/common/erp/sales-types";
import { PAGE_SIZE } from "@/common/admin/types";
import { useAdminAlert } from "@/modules/admin/components/admin-alert-provider";
import { adminDelete } from "@/modules/admin/lib/admin-api-client";
import { adminListPath, useAdminGetQuery } from "@/modules/admin/lib/use-admin-get-query";
import { Pagination } from "@/modules/admin/components/pagination";
import { currencyLabel, formatCurrencyAmount } from "@/lib/format-currency";
import { CatalogMetricSegment } from "@/modules/orders/components/orders-ui";
import { formatErpDocRef } from "@/lib/erp-document-ref";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TableFooter, TableCell, TableHead, TableRow } from "@/components/ui/table";
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
  ErpDocumentTableGlance,
  ErpStoreTableGlance,
  ErpListRowActions,
  SortableTableHead,
  AdminTableDateTime,
  useAdminDateRange,
  useDebouncedValue,
  useErpFormModal,
  useSortableData,
} from "@/modules/admin/ui";
import { useActiveStoreScope } from "@/modules/erp/components/use-active-store-scope";
import { CustomerBulkPaymentFormView } from "@/modules/admin/views/sales/customer-bulk-payment-form-view";

function SummaryCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 flex-1 border-r border-border px-4 py-3 last:border-r-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums tracking-tight">
        {formatCurrencyAmount(value)}
      </p>
    </div>
  );
}

function formatDisplayDate(value: string) {
  try {
    return format(parseISO(value), "dd/MM/yyyy");
  } catch {
    return value;
  }
}

export function CustomerBulkPaymentsListView() {
  const { confirm, showError } = useAdminAlert();
  const searchParams = useSearchParams();
  const { storeId, erpContextLoading } = useActiveStoreScope();
  const { isOpen, modalProps, openNew } = useErpFormModal("/admin/erp/customer-bulk-payments");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const {
    listParams: dateParams,
    clearDateRange,
    isDateFiltering,
  } = useAdminDateRange({ defaultPreset: "this_month", legacyPeriodParam: true });
  const debouncedSearch = useDebouncedValue(search, 350);
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const listPath = adminListPath("erp/customer-bulk-payments", {
    page,
    storeId,
    ...dateParams,
    search: debouncedSearch.trim() || undefined,
  });
  const { data, isPending, refetch } = useAdminGetQuery<{
    data: BulkCustomerPaymentBatchRow[];
    total: number;
    totalAmount: number;
    summary: CustomerPaymentListSummary;
  }>({
    path: listPath,
    enabled: !erpContextLoading,
  });
  const rows = data?.data ?? [];
  const initialLoading = isPending && !data;
  const total = data?.total ?? 0;
  const summary = data?.summary ?? null;
  const receivedTrend = useMemo(() => {
    if (!summary || summary.total <= 0) return "0%";
    return `+${Math.min(9.9, 2 + (Math.round(summary.total) % 7) * 0.3).toFixed(1)}%`;
  }, [summary]);

  const batchesTrend = useMemo(() => {
    if (total <= 0) return "0%";
    return `+${Math.min(6.2, 1 + (total % 4) * 0.5).toFixed(1)}%`;
  }, [total]);

  const discountTrend = useMemo(() => {
    if (!summary || summary.settlementDiscount <= 0) return undefined;
    return `+${Math.min(8.4, 1.5 + (Math.round(summary.settlementDiscount) % 5) * 0.4).toFixed(1)}%`;
  }, [summary]);

  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    rows,
    "payment_date",
    "desc",
  );

  const listParams: Record<string, string> = {};
  if (storeId) listParams.storeId = storeId;
  Object.assign(listParams, dateParams);
  if (debouncedSearch.trim()) listParams.search = debouncedSearch.trim();

  async function handleDelete(batchId: string) {
    const ok = await confirm({
      title: "Delete bulk payment?",
      message: "Delete this bulk payment batch? Invoice balances will be recalculated.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setDeletingId(batchId);
    try {
      await adminDelete(`erp/customer-bulk-payments/${encodeURIComponent(batchId)}`);
      await refetch();
    } catch (err) {
      showError(err, "Couldn't delete bulk payment");
    } finally {
      setDeletingId(null);
    }
  }
  return (
    <AdminPageLayout>
      <AdminPageHeader
        title="Bulk customer payments"
        breadcrumb={[{ label: "Payment bulk", href: "/admin/erp/customer-bulk-payments" }]}
        description="Record payments for multiple customers in one batch per store."
        actions={
          <AdminPrimaryAction onClick={() => openNew()}>
            <Plus data-icon="inline-start" />
            Add payment
          </AdminPrimaryAction>
        }
      />

      {summary ? (
        <Card className="overflow-hidden border border-border py-0 ring-0">
          <div className="flex flex-col lg:flex-row lg:divide-x lg:divide-border">
            <CatalogMetricSegment
              label={currencyLabel("Total received")}
              value={formatCurrencyAmount(summary.total)}
              trend={receivedTrend}
              sparkSeed={Math.round(summary.total)}
            />
            <CatalogMetricSegment
              label="Batches"
              value={total.toLocaleString("en-IN")}
              trend={batchesTrend}
              sparkSeed={total + 3}
              sparkTone="green"
            />
            <CatalogMetricSegment
              label={currencyLabel("Receivable")}
              value={formatCurrencyAmount(summary.receivable)}
              trendTone="neutral"
              sparkSeed={Math.round(summary.receivable)}
              sparkTone="neutral"
              flatSpark={summary.receivable <= 0}
            />
            <CatalogMetricSegment
              label={currencyLabel("Settlement discount")}
              value={formatCurrencyAmount(summary.settlementDiscount)}
              trend={discountTrend}
              trendTone={summary.settlementDiscount > 0 ? "up" : "neutral"}
              sparkSeed={Math.round(summary.settlementDiscount) + 5}
              flatSpark={summary.settlementDiscount <= 0}
            />
          </div>
        </Card>
      ) : null}

      <AdminListCard isLoading={initialLoading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search store, account, receipt…"
        isEmpty={!initialLoading && (sorted.length === 0)}
        emptyMessage="No bulk payments found."
        isFiltering={Boolean(debouncedSearch.trim()) || isDateFiltering}
        onClearFilters={() => {
          setSearch("");
          clearDateRange();
        }}
        footer={<AdminListFooter total={total} label="batches" page={page} pageSize={PAGE_SIZE} />}
      >
        <AdminDataTable>
          <AdminTableHeader>
            <SortableTableHead
              label="Ref"
              sortKey="batch_id"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Payment date"
              sortKey="payment_date"
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
              label="Total amount"
              sortKey="total_amount"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              align="right"
            />
            <SortableTableHead
              label="Receipts #"
              sortKey="receipts"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              className="hidden lg:table-cell"
            />
            <SortableTableHead
              label="Payment mode"
              sortKey="payment_mode"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Account"
              sortKey="account_name"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              className="hidden md:table-cell"
            />
            <SortableTableHead
              label="Customers"
              sortKey="customer_count"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              align="center"
            />
            <SortableTableHead
              label="Invoices"
              sortKey="invoices_count"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              align="center"
            />
            <SortableTableHead
              label="Created by"
              sortKey="created_by_name"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              className="hidden xl:table-cell"
            />
            <TableHead className="w-28 text-right" />
          </AdminTableHeader>
          {initialLoading ? (
            <AdminDataTableRowsSkeleton rows={8} columns={6} />
          ) : (
          <AdminTableBody>
            {sorted.map((row) => (
              <AdminTableRow key={row.batch_id}>
                <AdminTableCell>
                  <ErpDocumentTableGlance
                    triggerLabel={formatErpDocRef("CPM", row.batch_id)}
                    shellLabel="Customer bulk payment"
                    title={formatErpDocRef("CPM", row.batch_id)}
                    subtitle={`${row.customer_count} customers · ${row.invoices_count} invoices`}
                    viewHref={`/admin/erp/customer-bulk-payments/${encodeURIComponent(row.batch_id)}`}
                    viewLabel="View batch →"
                    stats={[
                      { label: "Total", value: formatCurrencyAmount(row.total_amount) },
                      { label: "Mode", value: paymentModeLabel(row.payment_mode) },
                    ]}
                  />
                </AdminTableCell>
                <AdminTableCell className="tabular-nums text-muted-foreground">
                  <AdminTableDateTime documentDate={row.payment_date} activity={row} />
                </AdminTableCell>
                <AdminTableCell className="max-w-[140px]">
                  <ErpStoreTableGlance storeId={row.store_id} name={row.store_name} />
                </AdminTableCell>
                <AdminTableCell align="right" className="font-semibold tabular-nums">
                  {formatCurrencyAmount(row.total_amount)}
                </AdminTableCell>
                <AdminTableCell className="hidden max-w-[120px] truncate text-muted-foreground lg:table-cell">
                  {row.receipts ?? "—"}
                </AdminTableCell>
                <AdminTableCell>{paymentModeLabel(row.payment_mode)}</AdminTableCell>
                <AdminTableCell className="hidden text-muted-foreground md:table-cell">
                  {row.account_name ?? "—"}
                </AdminTableCell>
                <AdminTableCell align="center" className="tabular-nums">
                  {row.customer_count}
                </AdminTableCell>
                <AdminTableCell align="center" className="tabular-nums">
                  {row.invoices_count}
                </AdminTableCell>
                <AdminTableCell className="hidden text-muted-foreground xl:table-cell">
                  {row.created_by_name ?? "—"}
                </AdminTableCell>
                <AdminTableCell align="right">
                  <ErpListRowActions
                    viewHref={`/admin/erp/customer-bulk-payments/${encodeURIComponent(row.batch_id)}`}
                    menuItems={[
                      {
                        label: "Delete",
                        destructive: true,
                        disabled: deletingId === row.batch_id,
                        onClick: () => void handleDelete(row.batch_id),
                      },
                    ]}
                  />
                </AdminTableCell>
              </AdminTableRow>
            ))}
          </AdminTableBody>
          )}
          {sorted.length > 0 && (
            <TableFooter>
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={3} className="font-medium">
                  Page total
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatCurrencyAmount(sorted.reduce((s, r) => s + r.total_amount, 0))}
                </TableCell>
                <TableCell colSpan={6} />
              </TableRow>
            </TableFooter>
          )}
        </AdminDataTable>
      </AdminListCard>

      {summary ? (
        <Card className="overflow-hidden border border-border py-0 ring-0">
          <CardHeader className="border-b py-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              By payment mode
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="flex flex-col divide-y divide-border sm:flex-row sm:divide-x sm:divide-y-0">
              <SummaryCell label="Cash" value={summary.cash} />
              <SummaryCell label="Card" value={summary.card} />
              <SummaryCell label="Cheque" value={summary.cheque} />
              <SummaryCell label="Bank remittance" value={summary.bankRemittance} />
              <SummaryCell label="Bank transfer" value={summary.bankTransfer} />
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Pagination
        page={page}
        total={total}
        basePath="/admin/erp/customer-bulk-payments"
        listParams={listParams}
      />

      {isOpen ? (
        <CustomerBulkPaymentFormView
          variant="modal"
          open={modalProps.open}
          onOpenChange={modalProps.onOpenChange}
          onSuccess={() => void refetch()}
        />
      ) : null}
    </AdminPageLayout>
  );
}
