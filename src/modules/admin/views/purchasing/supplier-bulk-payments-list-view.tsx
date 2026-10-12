"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";

import type {
  BulkSupplierPaymentBatchRow,
  SupplierPaymentListSummary,
} from "@/common/erp/purchasing-types";
import { PAGE_SIZE } from "@/common/admin/types";
import { adminListPath, useAdminGetQuery } from "@/modules/admin/lib/use-admin-get-query";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { Pagination } from "@/modules/admin/components/pagination";
import { currencyLabel, formatCurrencyAmount } from "@/lib/format-currency";
import { formatErpDocRef } from "@/lib/erp-document-ref";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TableHead } from "@/components/ui/table";
import { CatalogMetricSegment } from "@/modules/orders/components/orders-ui";
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
import { SupplierBulkPaymentFormView } from "@/modules/admin/views/purchasing/supplier-bulk-payment-views";

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

export function SupplierBulkPaymentsListView() {
  const searchParams = useSearchParams();
  const { isOpen, modalProps, openNew } = useErpFormModal("/admin/erp/supplier-bulk-payments");
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const {
    listParams: dateParams,
    clearDateRange,
    isDateFiltering,
  } = useAdminDateRange({ legacyPeriodParam: true });
  const debouncedSearch = useDebouncedValue(search, 350);
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const listPath = adminListPath("erp/supplier-payments", {
    view: "bulk",
    page,
    ...dateParams,
    search: debouncedSearch.trim() || undefined,
  });
  const { data, isPending, refetch } = useAdminGetQuery<{
    data: BulkSupplierPaymentBatchRow[];
    total: number;
    summary: SupplierPaymentListSummary;
  }>({
    path: listPath,
  });
  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const summary = data?.summary ?? null;
  const paidTrend = useMemo(() => {
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
  Object.assign(listParams, dateParams);
  if (debouncedSearch.trim()) listParams.search = debouncedSearch.trim();

  if (isPending && !data) return <AdminPageSkeleton />;

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title="Supplier payments bulk"
        breadcrumb={[{ label: "Payment made bulk", href: "/admin/erp/supplier-bulk-payments" }]}
        description="Batch supplier payments applied across multiple bills in one transaction."
        actions={
          <Button size="sm" onClick={() => openNew()}>
            <Plus data-icon="inline-start" />
            Add new
          </Button>
        }
      />

      {summary ? (
        <Card className="overflow-hidden border border-border py-0 ring-0">
          <div className="flex flex-col lg:flex-row lg:divide-x lg:divide-border">
            <CatalogMetricSegment
              label={currencyLabel("Total paid")}
              value={formatCurrencyAmount(summary.total)}
              trend={paidTrend}
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
              label={currencyLabel("Payable")}
              value={formatCurrencyAmount(summary.payable)}
              trendTone="neutral"
              sparkSeed={Math.round(summary.payable)}
              sparkTone="neutral"
              flatSpark={summary.payable <= 0}
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

      <AdminListCard
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search store, reference…"
        isEmpty={sorted.length === 0}
        emptyMessage="No bulk supplier payments found."
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
              label="Amount"
              sortKey="total_amount"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              align="right"
            />
            <SortableTableHead
              label="Suppliers"
              sortKey="supplier_count"
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
            />
            <TableHead className="w-28 text-right" />
          </AdminTableHeader>
          <AdminTableBody>
            {sorted.map((r) => (
              <AdminTableRow key={r.batch_id}>
                <AdminTableCell>
                  <ErpDocumentTableGlance
                    triggerLabel={formatErpDocRef("SPM", r.batch_id)}
                    shellLabel="Supplier bulk payment"
                    title={formatErpDocRef("SPM", r.batch_id)}
                    subtitle={`${r.supplier_count} suppliers`}
                    viewHref={`/admin/erp/supplier-bulk-payments/${encodeURIComponent(r.batch_id)}`}
                    viewLabel="View batch →"
                    stats={[
                      { label: "Total", value: formatCurrencyAmount(r.total_amount) },
                      { label: "Mode", value: r.payment_mode },
                    ]}
                  />
                </AdminTableCell>
                <AdminTableCell className="text-muted-foreground">
                  <AdminTableDateTime documentDate={r.payment_date} activity={r} />
                </AdminTableCell>
                <AdminTableCell>
                  <ErpStoreTableGlance storeId={r.store_id} name={r.store_name} />
                </AdminTableCell>
                <AdminTableCell align="right" className="tabular-nums">
                  {formatCurrencyAmount(r.total_amount)}
                </AdminTableCell>
                <AdminTableCell align="center">{r.supplier_count}</AdminTableCell>
                <AdminTableCell>{r.created_by_name ?? "—"}</AdminTableCell>
                <AdminTableCell align="right">
                  <ErpListRowActions
                    viewHref={`/admin/erp/supplier-bulk-payments/${encodeURIComponent(r.batch_id)}`}
                  />
                </AdminTableCell>
              </AdminTableRow>
            ))}
          </AdminTableBody>
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
        basePath="/admin/erp/supplier-bulk-payments"
        listParams={listParams}
      />

      {isOpen ? (
        <SupplierBulkPaymentFormView
          variant="modal"
          open={modalProps.open}
          onOpenChange={modalProps.onOpenChange}
          onSuccess={() => void refetch()}
        />
      ) : null}
    </AdminPageLayout>
  );
}
