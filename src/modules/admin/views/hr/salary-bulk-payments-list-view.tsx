"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Plus } from "lucide-react";

import type { ErpSalaryBulkPaymentListRow } from "@/common/erp/hr-types";
import { PAGE_SIZE } from "@/common/admin/types";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { Pagination } from "@/modules/admin/components/pagination";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { Button } from "@/components/ui/button";
import {
  AdminDataTable,
  AdminDataTableRowsSkeleton,
  AdminListCard,
  AdminPageHeader,
  AdminPageLayout,
  AdminTableBody,
  AdminTableCell,
  AdminTableHeader,
  AdminTableRow,
  SortableTableHead,
  AdminTableDateTime,
  useAdminDateRange,
  useDebouncedValue,
  useErpFormModal,
  useSortableData,
} from "@/modules/admin/ui";
import { useActiveStoreScope } from "@/modules/erp/components/use-active-store-scope";
import { SalaryBulkPaymentFormView } from "@/modules/admin/views/hr/salary-bulk-payment-form-view";

function formatDisplayDate(value: string) {
  try {
    return format(parseISO(value), "dd-MMM-yyyy");
  } catch {
    return value;
  }
}

export function SalaryBulkPaymentsListView() {
  const searchParams = useSearchParams();
  const { activeStoreId, storeId } = useActiveStoreScope();
  const { isOpen, modalProps, openNew } = useErpFormModal("/admin/erp/salary-bulk-payments");
  const [reloadToken, setReloadToken] = useState(0);
  const [rows, setRows] = useState<ErpSalaryBulkPaymentListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const {
    listParams: dateParams,
    clearDateRange,
    isDateFiltering,
  } = useAdminDateRange({ defaultPreset: "this_month", legacyPeriodParam: true });
  const debouncedSearch = useDebouncedValue(search, 350);
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    rows,
    "payment_date",
    "desc",
  );

  useEffect(() => {
    setLoading(true);
    const q = new URLSearchParams();
    q.set("page", String(page));
    if (storeId) q.set("storeId", storeId);
    if (dateParams.dateFrom) q.set("dateFrom", dateParams.dateFrom);
    if (dateParams.dateTo) q.set("dateTo", dateParams.dateTo);
    if (debouncedSearch.trim()) q.set("search", debouncedSearch.trim());

    adminGet<{ data: ErpSalaryBulkPaymentListRow[]; total: number }>(
      `erp/salary-bulk-payments?${q.toString()}`,
    )
      .then((res) => {
        setRows(res.data);
        setTotal(res.total);
      })
      .finally(() => setLoading(false));
  }, [page, storeId, dateParams.dateFrom, dateParams.dateTo, debouncedSearch, reloadToken]);

  const listParams: Record<string, string> = {};
  if (storeId) listParams.storeId = storeId;
  Object.assign(listParams, dateParams);
  if (debouncedSearch.trim()) listParams.search = debouncedSearch.trim();
  const initialLoading = loading && rows.length === 0;

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title="Salary bulk payments"
        breadcrumb={[{ label: "Salary bulk payments", href: "/admin/erp/salary-bulk-payments" }]}
        description="Process salary payments for multiple employees in one batch."
        actions={
          <Button size="sm" onClick={() => openNew()}>
            <Plus data-icon="inline-start" />
            Add bulk payment
          </Button>
        }
      />

      <AdminListCard isLoading={initialLoading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search batch number…"
        isEmpty={!initialLoading && (sorted.length === 0)}
        emptyMessage="No bulk payments found."
        isFiltering={Boolean(debouncedSearch.trim()) || isDateFiltering}
        onClearFilters={() => {
          setSearch("");
          clearDateRange();
        }}
        footer={<span>{total} batches</span>}
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
              label="Store"
              sortKey="store_name"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Paid through"
              sortKey="paid_through_name"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Payment mode"
              sortKey="payment_mode"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Note"
              sortKey="notes"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              className="hidden md:table-cell"
            />
            <SortableTableHead
              label="Total paid"
              sortKey="total_amount"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              align="right"
            />
          </AdminTableHeader>
          {initialLoading ? (
            <AdminDataTableRowsSkeleton rows={8} columns={6} />
          ) : (
          <AdminTableBody>
            {sorted.map((row) => (
              <AdminTableRow key={row.id}>
                <AdminTableCell className="tabular-nums text-muted-foreground">
                  <AdminTableDateTime documentDate={row.payment_date} activity={row} />
                </AdminTableCell>
                <AdminTableCell className="max-w-[140px] truncate text-sm">
                  {row.store_name ?? "—"}
                </AdminTableCell>
                <AdminTableCell className="text-sm text-muted-foreground">
                  {row.paid_through_name ?? "—"}
                </AdminTableCell>
                <AdminTableCell>{row.payment_mode}</AdminTableCell>
                <AdminTableCell className="hidden max-w-[200px] truncate md:table-cell">
                  {row.notes ?? "—"}
                </AdminTableCell>
                <AdminTableCell align="right" className="font-semibold tabular-nums">
                  {formatCurrencyAmount(row.total_amount)}
                </AdminTableCell>
              </AdminTableRow>
            ))}
          </AdminTableBody>
          )}
        </AdminDataTable>
      </AdminListCard>

      <Pagination
        page={page}
        total={total}
        basePath="/admin/erp/salary-bulk-payments"
        listParams={listParams}
        pageSize={PAGE_SIZE}
      />

      {isOpen ? (
        <SalaryBulkPaymentFormView
          variant="modal"
          open={modalProps.open}
          onOpenChange={modalProps.onOpenChange}
          onSuccess={() => setReloadToken((t) => t + 1)}
        />
      ) : null}
    </AdminPageLayout>
  );
}
