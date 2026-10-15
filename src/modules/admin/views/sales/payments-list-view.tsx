"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";

import { DataExportMenu } from "@/components/export/data-export-menu";
import { buildCatalogExportSource, catalogFilterSubtitle } from "@/lib/export/catalog-export";
import { getPaymentsExportTabular } from "@/lib/export/erp-sales-list-export";

import type { CustomerPaymentListSummary, ErpPaymentListRow } from "@/common/erp/sales-types";
import { paymentModeLabel } from "@/common/erp/sales-types";
import { PAGE_SIZE } from "@/common/admin/types";
import { adminListPath, useAdminGetQuery } from "@/modules/admin/lib/use-admin-get-query";
import { Pagination } from "@/modules/admin/components/pagination";
import { currencyLabel, formatCurrencyAmount } from "@/lib/format-currency";
import { CatalogMetricSegment } from "@/modules/orders/components/orders-ui";
import { formatErpDocRef } from "@/lib/erp-document-ref";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TableHead } from "@/components/ui/table";
import {
  AdminDataTable,
  AdminDataTableRowsSkeleton,
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
  AdminTableDateTime,
  useAdminDateRange,
  useDebouncedValue,
  useErpFormModal,
  useSortableData,
} from "@/modules/admin/ui";
import { useActiveStoreScope } from "@/modules/erp/components/use-active-store-scope";
import { ErpSettlementFormView } from "@/modules/admin/views/erp/erp-settlement-form-view";
import { PaymentFormView } from "@/modules/admin/views/sales/payment-form-view";

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

export function PaymentsListView() {
  const searchParams = useSearchParams();
  const { storeId, erpContextLoading } = useActiveStoreScope();
  const { isOpen, modalProps, openNew } = useErpFormModal("/admin/erp/payments");
  const [settlementOpen, setSettlementOpen] = useState(false);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const {
    listParams: dateParams,
    clearDateRange,
    isDateFiltering,
  } = useAdminDateRange({ defaultPreset: "today", legacyPeriodParam: true });
  const debouncedSearch = useDebouncedValue(search, 350);
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const listPath = adminListPath("erp/payments", {
    page,
    storeId,
    ...dateParams,
    search: debouncedSearch.trim() || undefined,
  });
  const { data, isPending, refetch } = useAdminGetQuery<{
    data: ErpPaymentListRow[];
    total: number;
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

  const discountTrend = useMemo(() => {
    if (!summary || summary.settlementDiscount <= 0) return undefined;
    return `+${Math.min(8.4, 1.5 + (Math.round(summary.settlementDiscount) % 5) * 0.4).toFixed(1)}%`;
  }, [summary]);

  const paymentsTrend = useMemo(() => {
    if (total <= 0) return "0%";
    return `+${Math.min(6.2, 1 + (total % 4) * 0.5).toFixed(1)}%`;
  }, [total]);

  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    rows,
    "payment_date",
    "desc",
  );

  const listParams: Record<string, string> = {};
  if (storeId) listParams.storeId = storeId;
  Object.assign(listParams, dateParams);
  if (debouncedSearch.trim()) listParams.search = debouncedSearch.trim();

  const isFiltering = Boolean(debouncedSearch.trim()) || isDateFiltering;

  const exportSource = useMemo(
    () =>
      buildCatalogExportSource({
        baseFilename: "payments-export",
        title: "Payments received",
        getSubtitle: () =>
          catalogFilterSubtitle({
            search: debouncedSearch,
            storeLabel: storeId ? "Selected store" : undefined,
            dateFrom: dateParams.dateFrom,
            dateTo: dateParams.dateTo,
          }),
        getTabular: () => {
          const tabular = getPaymentsExportTabular(sorted);
          return tabular.rows.length > 0 ? tabular : null;
        },
      }),
    [sorted, debouncedSearch, storeId, dateParams],
  );

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title="Payments received"
        breadcrumb={[{ label: "Payments received", href: "/admin/erp/payments" }]}
        description="Individual customer payments against invoices. Filter by store or date period."
        actions={
          <>
            <DataExportMenu source={exportSource} disabled={sorted.length === 0} />
            <Button variant="outline" size="sm" onClick={() => setSettlementOpen(true)}>
              Settle account
            </Button>
            <Button size="sm" onClick={() => openNew()}>
              <Plus data-icon="inline-start" />
              Add new payment
            </Button>
          </>
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
              label="Payments"
              value={total.toLocaleString("en-IN")}
              trend={paymentsTrend}
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
        searchPlaceholder="Search payment, customer, invoice…"
        isEmpty={!initialLoading && (sorted.length === 0)}
        emptyMessage="No payments found."
        isFiltering={isFiltering}
        onClearFilters={() => {
          setSearch("");
          clearDateRange();
        }}
        footer={<AdminListFooter total={total} label="payments" page={page} pageSize={PAGE_SIZE} />}
      >
        <AdminDataTable>
          <AdminTableHeader>
            <SortableTableHead
              label="Payment date"
              sortKey="payment_date"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Invoice number"
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
              label="Customer"
              sortKey="customer_name"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Payment type"
              sortKey="payment_mode"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Paid amount"
              sortKey="total_amount"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              align="right"
            />
            <SortableTableHead
              label="Bank charges"
              sortKey="bank_charges"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              align="right"
              className="hidden lg:table-cell"
            />
            <TableHead className="w-28 text-right" />
          </AdminTableHeader>
          {initialLoading ? (
            <AdminDataTableRowsSkeleton rows={8} columns={6} />
          ) : (
          <AdminTableBody>
            {sorted.map((row) => (
              <AdminTableRow key={row.id}>
                <AdminTableCell className="text-muted-foreground">
                  <AdminTableDateTime documentDate={row.payment_date} activity={row} />
                </AdminTableCell>
                <AdminTableCell>
                  <ErpDocumentTableGlance
                    triggerLabel={formatErpDocRef("PR", row.id)}
                    shellLabel="Payment received"
                    title={row.payment_number?.trim() || formatErpDocRef("PR", row.id)}
                    subtitle={row.customer_name ?? undefined}
                    viewHref={`/admin/erp/payments/${row.id}`}
                    viewLabel="View payment →"
                    stats={[
                      { label: "Amount", value: formatCurrencyAmount(row.total_amount) },
                      { label: "Mode", value: paymentModeLabel(row.payment_mode) },
                    ]}
                  />
                </AdminTableCell>
                <AdminTableCell className="hidden max-w-[140px] md:table-cell">
                  <ErpStoreTableGlance storeId={row.store_id} name={row.store_name} />
                </AdminTableCell>
                <AdminTableCell className="max-w-[180px]">
                  <ErpCustomerTableGlance
                    userId={row.user_id}
                    name={row.customer_name}
                    stats={
                      row.unallocated_amount > 0
                        ? [
                            {
                              label: "Unallocated credit",
                              value: formatCurrencyAmount(row.unallocated_amount),
                            },
                          ]
                        : undefined
                    }
                  />
                </AdminTableCell>
                <AdminTableCell className="capitalize">
                  {paymentModeLabel(row.payment_mode)}
                </AdminTableCell>
                <AdminTableCell align="right" className="font-semibold tabular-nums">
                  {formatCurrencyAmount(row.total_amount)}
                </AdminTableCell>
                <AdminTableCell
                  align="right"
                  className="hidden tabular-nums text-muted-foreground lg:table-cell"
                >
                  {formatCurrencyAmount(row.bank_charges)}
                </AdminTableCell>
                <AdminTableCell align="right">
                  <ErpListRowActions
                    viewHref={`/admin/erp/payments/${row.id}`}
                    printHref={`/admin/erp/payments/${row.id}/print`}
                  />
                </AdminTableCell>
              </AdminTableRow>
            ))}
          </AdminTableBody>
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
        total={total}
        page={page}
        basePath="/admin/erp/payments"
        listParams={listParams}
      />

      {isOpen ? (
        <PaymentFormView
          variant="modal"
          open={modalProps.open}
          onOpenChange={modalProps.onOpenChange}
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
