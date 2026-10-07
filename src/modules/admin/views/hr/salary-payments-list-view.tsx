"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Plus } from "lucide-react";

import type { ErpSalaryPaymentListRow } from "@/common/erp/hr-types";
import { PAGE_SIZE } from "@/common/admin/types";
import { adminDelete, adminGet } from "@/modules/admin/lib/admin-api-client";
import { Pagination } from "@/modules/admin/components/pagination";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { Button } from "@/components/ui/button";
import { TableCell, TableFooter, TableHead, TableRow } from "@/components/ui/table";
import {
  AdminDataTable,
  AdminListCard,
  AdminPageHeader,
  AdminPageLayout,
  AdminTableBody,
  AdminTableCell,
  AdminTableHeader,
  AdminTableLink,
  AdminTableRow,
  ErpListRowActions,
  SortableTableHead,
  useDebouncedValue,
  useErpFormModal,
  useSortableData,
} from "@/modules/admin/ui";
import { useActiveStoreScope } from "@/modules/erp/components/use-active-store-scope";
import { SalaryPaymentFormView } from "@/modules/admin/views/hr/salary-payment-form-view";

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

export function SalaryPaymentsListView() {
  const searchParams = useSearchParams();
  const { activeStoreId, storeId } = useActiveStoreScope();
  const { isOpen, modalProps, openNew } = useErpFormModal("/admin/erp/salary-payments");
  const [reloadToken, setReloadToken] = useState(0);
  const [rows, setRows] = useState<ErpSalaryPaymentListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totals, setTotals] = useState({
    totalPaid: 0,
    salaryPayment: 0,
    advancePayment: 0,
    advanceBalance: 0,
  });
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
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

    adminGet<{
      data: ErpSalaryPaymentListRow[];
      total: number;
      totals: typeof totals;
    }>(`erp/salary-payments?${q.toString()}`)
      .then((res) => {
        setRows(res.data);
        setTotal(res.total);
        setTotals(res.totals);
      })
      .finally(() => setLoading(false));
  }, [page, storeId, period, debouncedSearch, reloadToken]);

  const listParams: Record<string, string> = {};
  if (storeId) listParams.storeId = storeId;
  if (period !== "all") listParams.period = period;
  if (debouncedSearch.trim()) listParams.search = debouncedSearch.trim();

  async function handleDelete(id: string) {
    if (!confirm("Delete this salary payment?")) return;
    setDeletingId(id);
    try {
      await adminDelete(`erp/salary-payments/${id}`);
      setReloadToken((t) => t + 1);
    } finally {
      setDeletingId(null);
    }
  }

  if (loading && rows.length === 0) return <AdminPageSkeleton />;

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title="Salary payments"
        breadcrumb={[{ label: "Salary payments", href: "/admin/erp/salary-payments" }]}
        description="Individual salary payments to employees. Excess over balance becomes advance."
        actions={
          <Button size="sm" onClick={() => openNew()}>
            <Plus data-icon="inline-start" />
            Add payment
          </Button>
        }
      />

      <AdminListCard
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search employee or payment number…"
        isEmpty={rows.length === 0}
        emptyMessage="No salary payments found."
        isFiltering={Boolean(debouncedSearch.trim()) || period !== "all"}
        onClearFilters={() => {
          setSearch("");
          setPeriod("this_month");
        }}
        filters={[
          { id: "period", label: "Period", value: period, onChange: setPeriod, options: PERIOD_OPTIONS },
        ]}
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <span>{total} payments</span>
            <span className="font-semibold tabular-nums">
              Total paid: {formatCurrencyAmount(totals.totalPaid)}
            </span>
          </div>
        }
      >
        <AdminDataTable>
          <AdminTableHeader>
            <SortableTableHead
              label="Employee"
              sortKey="employee_name"
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
              label="Payment date"
              sortKey="payment_date"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Total paid"
              sortKey="total_paid_amount"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              align="right"
            />
            <SortableTableHead
              label="Salary"
              sortKey="salary_payment_amount"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              align="right"
              className="hidden md:table-cell"
            />
            <SortableTableHead
              label="Advance"
              sortKey="advance_payment_amount"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              align="right"
              className="hidden lg:table-cell"
            />
            <SortableTableHead
              label="Adv. balance"
              sortKey="advance_balance_after"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              align="right"
              className="hidden xl:table-cell"
            />
            <TableHead className="w-20 text-right" />
          </AdminTableHeader>
          <AdminTableBody>
            {sorted.map((row) => (
              <AdminTableRow key={row.id}>
                <AdminTableCell>
                  <AdminTableLink href={`/admin/erp/employees/${row.employee_id}`}>
                    {row.employee_name}
                  </AdminTableLink>
                </AdminTableCell>
                <AdminTableCell className="max-w-[140px] truncate text-sm">
                  {row.store_name ?? "—"}
                </AdminTableCell>
                <AdminTableCell className="tabular-nums text-muted-foreground">
                  {formatDisplayDate(row.payment_date)}
                </AdminTableCell>
                <AdminTableCell align="right" className="font-semibold tabular-nums">
                  {formatCurrencyAmount(row.total_paid_amount)}
                </AdminTableCell>
                <AdminTableCell align="right" className="hidden tabular-nums md:table-cell">
                  {formatCurrencyAmount(row.salary_payment_amount)}
                </AdminTableCell>
                <AdminTableCell align="right" className="hidden tabular-nums lg:table-cell">
                  {formatCurrencyAmount(row.advance_payment_amount)}
                </AdminTableCell>
                <AdminTableCell align="right" className="hidden tabular-nums xl:table-cell">
                  {formatCurrencyAmount(row.advance_balance_after)}
                </AdminTableCell>
                <AdminTableCell align="right">
                  <ErpListRowActions
                    menuItems={[
                      {
                        label: "Delete",
                        destructive: true,
                        disabled: deletingId === row.id,
                        onClick: () => void handleDelete(row.id),
                      },
                    ]}
                  />
                </AdminTableCell>
              </AdminTableRow>
            ))}
          </AdminTableBody>
          {rows.length > 0 ? (
            <TableFooter>
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={3} className="font-medium">Page total</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatCurrencyAmount(totals.totalPaid)}
                </TableCell>
                <TableCell className="hidden text-right font-semibold tabular-nums md:table-cell">
                  {formatCurrencyAmount(totals.salaryPayment)}
                </TableCell>
                <TableCell className="hidden text-right font-semibold tabular-nums lg:table-cell">
                  {formatCurrencyAmount(totals.advancePayment)}
                </TableCell>
                <TableCell className="hidden text-right font-semibold tabular-nums xl:table-cell">
                  {formatCurrencyAmount(totals.advanceBalance)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          ) : null}
        </AdminDataTable>
      </AdminListCard>

      <Pagination
        page={page}
        total={total}
        basePath="/admin/erp/salary-payments"
        listParams={listParams}
        pageSize={PAGE_SIZE}
      />

      {isOpen ? (
        <SalaryPaymentFormView
          variant="modal"
          open={modalProps.open}
          onOpenChange={modalProps.onOpenChange}
          onSuccess={() => setReloadToken((t) => t + 1)}
        />
      ) : null}
    </AdminPageLayout>
  );
}
