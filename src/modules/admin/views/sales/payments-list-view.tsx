"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { format, subDays } from "date-fns";
import { Download, Plus } from "lucide-react";

import type { ErpPaymentListRow, ErpPaymentSummary } from "@/common/erp/sales-types";
import { paymentModeLabel } from "@/common/erp/sales-types";
import { PAGE_SIZE } from "@/common/admin/types";
import { adminListPath, useAdminGetQuery } from "@/modules/admin/lib/use-admin-get-query";
import { Pagination } from "@/modules/admin/components/pagination";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { formatCurrencyAmount } from "@/lib/format-currency";
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
  ErpCustomerTableGlance,
  ErpDocumentTableGlance,
  ErpStoreTableGlance,
  ErpListRowActions,
  SortableTableHead,
  useDebouncedValue,
  useErpFormModal,
  useSortableData,
} from "@/modules/admin/ui";
import { useActiveStoreScope } from "@/modules/erp/components/use-active-store-scope";
import { PaymentFormView } from "@/modules/admin/views/sales/payment-form-view";

const PERIOD_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "all", label: "All dates" },
];

function periodToDates(period: string): { dateFrom?: string; dateTo?: string } {
  const today = format(new Date(), "yyyy-MM-dd");
  if (period === "today") return { dateFrom: today, dateTo: today };
  if (period === "7")
    return { dateFrom: format(subDays(new Date(), 7), "yyyy-MM-dd"), dateTo: today };
  if (period === "30")
    return { dateFrom: format(subDays(new Date(), 30), "yyyy-MM-dd"), dateTo: today };
  return {};
}

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
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [period, setPeriod] = useState(searchParams.get("period") ?? "today");
  const debouncedSearch = useDebouncedValue(search, 350);
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const { dateFrom, dateTo } = useMemo(() => periodToDates(period), [period]);
  const listPath = adminListPath("erp/payments", {
    page,
    storeId,
    dateFrom,
    dateTo,
    search: debouncedSearch.trim() || undefined,
  });
  const { data, isPending, refetch } = useAdminGetQuery<{
    data: ErpPaymentListRow[];
    total: number;
    summary: ErpPaymentSummary;
  }>({
    path: listPath,
    enabled: !erpContextLoading,
  });
  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const summary = data?.summary ?? null;
  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    rows,
    "payment_date",
    "desc",
  );

  const listParams: Record<string, string> = {};
  if (storeId) listParams.storeId = storeId;
  if (period !== "today") listParams.period = period;
  if (debouncedSearch.trim()) listParams.search = debouncedSearch.trim();

  const isFiltering = Boolean(debouncedSearch.trim()) || period !== "all";

  const reportLabel =
    dateFrom && dateTo
      ? dateFrom === dateTo
        ? format(new Date(`${dateFrom}T12:00:00`), "EEEE, MMMM d, yyyy")
        : `${format(new Date(`${dateFrom}T12:00:00`), "MMM d, yyyy")} – ${format(new Date(`${dateTo}T12:00:00`), "MMM d, yyyy")}`
      : "All dates";

  if (isPending && !data) return <AdminPageSkeleton />;

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title="Payments"
        breadcrumb={[{ label: "Payments", href: "/admin/erp/payments" }]}
        description="Customer payments received against invoices. Filter by store or date period."
        actions={
          <>
            <Button variant="outline" size="sm">
              <Download data-icon="inline-start" />
              Export
            </Button>
            <Button size="sm" onClick={() => openNew()}>
              <Plus data-icon="inline-start" />
              Add new payment
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          Report period: <span className="font-medium text-foreground">{reportLabel}</span>
        </span>
        <span>
          Total count:{" "}
          <span className="font-medium tabular-nums text-foreground">
            {total.toLocaleString("en-IN")}
          </span>
        </span>
      </div>

      <AdminListCard
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search payment, customer, invoice…"
        isEmpty={sorted.length === 0}
        emptyMessage="No payments found."
        isFiltering={isFiltering}
        onClearFilters={() => {
          setSearch("");
          setPeriod("all");
        }}
        filters={[
          {
            id: "period",
            label: "Period",
            value: period,
            options: PERIOD_OPTIONS,
            onChange: setPeriod,
          },
        ]}
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
          <AdminTableBody>
            {sorted.map((row) => (
              <AdminTableRow key={row.id}>
                <AdminTableCell className="text-muted-foreground">{row.payment_date}</AdminTableCell>
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
        </AdminDataTable>
      </AdminListCard>

      {summary ? (
        <Card className="overflow-hidden border border-border py-0 ring-0">
          <CardHeader className="border-b py-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Payment summary
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
    </AdminPageLayout>
  );
}
