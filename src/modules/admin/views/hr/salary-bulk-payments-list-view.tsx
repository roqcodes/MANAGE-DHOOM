"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Plus } from "lucide-react";

import type { ErpSalaryBulkPaymentListRow } from "@/common/erp/hr-types";
import { PAGE_SIZE } from "@/common/admin/types";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { Pagination } from "@/modules/admin/components/pagination";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { Button } from "@/components/ui/button";
import {
  AdminDataTable,
  AdminListCard,
  AdminPageHeader,
  AdminPageLayout,
  AdminTableBody,
  AdminTableCell,
  AdminTableHeader,
  AdminTableRow,
  SortableTableHead,
  useDebouncedValue,
  useErpFormModal,
  useSortableData,
} from "@/modules/admin/ui";
import { useActiveStoreScope } from "@/modules/erp/components/use-active-store-scope";
import { SalaryBulkPaymentFormView } from "@/modules/admin/views/hr/salary-bulk-payment-form-view";

const PERIOD_OPTIONS = [
  { value: "all", label: "All dates" },
  { value: "this_month", label: "This month" },
  { value: "this_quarter", label: "This quarter" },
];

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
  const [period, setPeriod] = useState(searchParams.get("period") ?? "this_month");
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
    if (period !== "all") q.set("period", period);
    if (debouncedSearch.trim()) q.set("search", debouncedSearch.trim());

    adminGet<{ data: ErpSalaryBulkPaymentListRow[]; total: number }>(
      `erp/salary-bulk-payments?${q.toString()}`,
    )
      .then((res) => {
        setRows(res.data);
        setTotal(res.total);
      })
      .finally(() => setLoading(false));
  }, [page, storeId, period, debouncedSearch, reloadToken]);

  const listParams: Record<string, string> = {};
  if (storeId) listParams.storeId = storeId;
  if (period !== "all") listParams.period = period;
  if (debouncedSearch.trim()) listParams.search = debouncedSearch.trim();

  if (loading && rows.length === 0) return <AdminPageSkeleton />;

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

      <AdminListCard
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search batch number…"
        isEmpty={sorted.length === 0}
        emptyMessage="No bulk payments found."
        isFiltering={Boolean(debouncedSearch.trim()) || period !== "all"}
        onClearFilters={() => {
          setSearch("");
          setPeriod("this_month");
        }}
        filters={[
          { id: "period", label: "Period", value: period, onChange: setPeriod, options: PERIOD_OPTIONS },
        ]}
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
          <AdminTableBody>
            {sorted.map((row) => (
              <AdminTableRow key={row.id}>
                <AdminTableCell className="tabular-nums text-muted-foreground">
                  {formatDisplayDate(row.payment_date)}
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
