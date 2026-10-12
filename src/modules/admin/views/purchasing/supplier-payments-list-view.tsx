"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";

import type {
  ErpSupplierPaymentListRow,
  SupplierPaymentListSummary,
} from "@/common/erp/purchasing-types";
import { ERP_SUPPLIER_PAYMENT_MODES } from "@/common/erp/purchasing-types";
import { PAGE_SIZE } from "@/common/admin/types";
import { adminListPath, useAdminGetQuery } from "@/modules/admin/lib/use-admin-get-query";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { Pagination } from "@/modules/admin/components/pagination";
import { currencyLabel, formatCurrencyAmount } from "@/lib/format-currency";
import { CatalogMetricSegment } from "@/modules/orders/components/orders-ui";
import { formatErpDocRef } from "@/lib/erp-document-ref";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  ErpDocumentTableGlance,
  ErpStoreTableGlance,
  ErpVendorTableGlance,
  ErpListRowActions,
  SortableTableHead,
  AdminTableDateTime,
  useAdminDateRange,
  useDebouncedValue,
  useErpFormModal,
  useSortableData,
} from "@/modules/admin/ui";
import { ErpSettlementFormView } from "@/modules/admin/views/erp/erp-settlement-form-view";
import { SupplierPaymentFormView } from "@/modules/admin/views/purchasing/supplier-payment-form-view";

const PAYMENT_MODE_OPTIONS = [
  { value: "all", label: "All payment modes" },
  ...ERP_SUPPLIER_PAYMENT_MODES.map((m) => ({ value: m, label: m })),
];

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

export function SupplierPaymentsListView() {
  const searchParams = useSearchParams();
  const { isOpen, modalProps, openNew } = useErpFormModal("/admin/erp/supplier-payments");
  const [settlementOpen, setSettlementOpen] = useState(false);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [paymentMode, setPaymentMode] = useState(searchParams.get("paymentMode") ?? "all");
  const {
    listParams: dateParams,
    clearDateRange,
    isDateFiltering,
  } = useAdminDateRange({ legacyPeriodParam: true });
  const debouncedSearch = useDebouncedValue(search, 350);
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const listPath = adminListPath("erp/supplier-payments", {
    page,
    isBulk: "false",
    paymentMode: paymentMode !== "all" ? paymentMode : undefined,
    ...dateParams,
    search: debouncedSearch.trim() || undefined,
  });
  const { data, isPending, refetch } = useAdminGetQuery<{
    data: ErpSupplierPaymentListRow[];
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
  if (paymentMode !== "all") listParams.paymentMode = paymentMode;
  Object.assign(listParams, dateParams);
  if (debouncedSearch.trim()) listParams.search = debouncedSearch.trim();

  const isFiltering =
    Boolean(debouncedSearch.trim()) || paymentMode !== "all" || isDateFiltering;

  if (isPending && !data) return <AdminPageSkeleton />;

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title="Payment made"
        breadcrumb={[{ label: "Payment made", href: "/admin/erp/supplier-payments" }]}
        description="Individual supplier payments against purchase bills. Filter by payment mode or period."
        actions={
          <>
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
              label={currencyLabel("Total paid")}
              value={formatCurrencyAmount(summary.total)}
              trend={paidTrend}
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
        searchPlaceholder="Search payment, vendor, bill, reference…"
        isEmpty={sorted.length === 0}
        emptyMessage="No supplier payments found."
        isFiltering={isFiltering}
        onClearFilters={() => {
          setSearch("");
          setPaymentMode("all");
          clearDateRange();
        }}
        filters={[
          {
            id: "paymentMode",
            label: "Payment mode",
            value: paymentMode,
            options: PAYMENT_MODE_OPTIONS,
            onChange: setPaymentMode,
          },
        ]}
        footer={<AdminListFooter total={total} label="payments" page={page} pageSize={PAGE_SIZE} />}
      >
        <AdminDataTable>
          <AdminTableHeader>
            <SortableTableHead
              label="Date"
              sortKey="payment_date"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Payment #"
              sortKey="payment_number"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Payment made for"
              sortKey="payment_made_for"
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
              label="Reference #"
              sortKey="reference"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Vendor"
              sortKey="vendor_name"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Bill #"
              sortKey="bill_numbers"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Mode"
              sortKey="payment_mode"
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
            <TableHead className="w-28 text-right" />
          </AdminTableHeader>
          <AdminTableBody>
            {sorted.map((r) => (
              <AdminTableRow key={r.id}>
                <AdminTableCell className="text-muted-foreground">
                  <AdminTableDateTime documentDate={r.payment_date} activity={r} />
                </AdminTableCell>
                <AdminTableCell>
                  <ErpDocumentTableGlance
                    triggerLabel={formatErpDocRef("PM", r.id)}
                    shellLabel="Supplier payment"
                    title={r.payment_number?.trim() || formatErpDocRef("PM", r.id)}
                    subtitle={r.vendor_name ?? undefined}
                    viewHref={`/admin/erp/supplier-payments/${r.id}`}
                    viewLabel="View payment →"
                    stats={[
                      { label: "Amount", value: formatCurrencyAmount(r.total_amount) },
                      { label: "Mode", value: r.payment_mode },
                    ]}
                  />
                </AdminTableCell>
                <AdminTableCell>{r.payment_made_for ?? "—"}</AdminTableCell>
                <AdminTableCell>
                  <ErpStoreTableGlance storeId={r.store_id} name={r.store_name} />
                </AdminTableCell>
                <AdminTableCell>{r.reference ?? "—"}</AdminTableCell>
                <AdminTableCell>
                  <ErpVendorTableGlance vendorId={r.vendor_id} name={r.vendor_name} />
                </AdminTableCell>
                <AdminTableCell>{r.bill_numbers ?? "—"}</AdminTableCell>
                <AdminTableCell>{r.payment_mode}</AdminTableCell>
                <AdminTableCell align="right" className="tabular-nums">
                  {formatCurrencyAmount(r.total_amount)}
                </AdminTableCell>
                <AdminTableCell align="right">
                  <ErpListRowActions viewHref={`/admin/erp/supplier-payments/${r.id}`} />
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
        basePath="/admin/erp/supplier-payments"
        listParams={listParams}
      />

      {isOpen ? (
        <SupplierPaymentFormView
          variant="modal"
          open={modalProps.open}
          onOpenChange={modalProps.onOpenChange}
          onSuccess={() => void refetch()}
        />
      ) : null}

      {settlementOpen ? (
        <ErpSettlementFormView
          side="supplier"
          variant="modal"
          open={settlementOpen}
          onOpenChange={setSettlementOpen}
          onSuccess={() => void refetch()}
        />
      ) : null}
    </AdminPageLayout>
  );
}
