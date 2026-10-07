"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Plus } from "lucide-react";

import type { ErpExpenseListRow } from "@/common/erp/purchasing-types";
import { PAGE_SIZE } from "@/common/admin/types";
import { adminDelete } from "@/modules/admin/lib/admin-api-client";
import { adminListPath, useAdminGetQuery } from "@/modules/admin/lib/use-admin-get-query";
import { Pagination } from "@/modules/admin/components/pagination";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { formatErpDocRef } from "@/lib/erp-document-ref";
import { Button } from "@/components/ui/button";
import { TableFooter, TableCell, TableHead, TableRow } from "@/components/ui/table";
import {
  AdminDataTable,
  AdminListCard,
  AdminPageHeader,
  AdminPageLayout,
  AdminTableBody,
  AdminTableCell,
  AdminTableHeader,
  AdminTableRow,
  ErpCustomerTableGlance,
  ErpDocumentTableGlance,
  ErpStoreTableGlance,
  ErpVendorTableGlance,
  ErpListRowActions,
  SortableTableHead,
  useDebouncedValue,
  useErpFormModal,
  useSortableData,
} from "@/modules/admin/ui";
import { useActiveStoreScope } from "@/modules/erp/components/use-active-store-scope";
import { ExpenseFormView } from "@/modules/admin/views/purchasing/expense-form-view";

const PERIOD_OPTIONS = [
  { value: "all", label: "All dates" },
  { value: "this_month", label: "This month" },
  { value: "today", label: "Today" },
];

function formatDisplayDate(value: string) {
  try {
    return format(parseISO(value), "dd-MMM-yyyy");
  } catch {
    return value;
  }
}

export function ExpensesListView() {
  const searchParams = useSearchParams();
  const { storeId, erpContextLoading } = useActiveStoreScope();
  const { isOpen, mode, editId, modalProps, openNew } = useErpFormModal("/admin/erp/expenses");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [period, setPeriod] = useState(searchParams.get("period") ?? "this_month");
  const [accountId, setAccountId] = useState(searchParams.get("accountId") ?? "");
  const debouncedSearch = useDebouncedValue(search, 350);
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const accountsPath = adminListPath("erp/expenses", { view: "accounts", storeId });
  const { data: accountsData } = useAdminGetQuery<{ data: Array<{ id: string; name: string }> }>({
    path: accountsPath,
    enabled: !erpContextLoading,
  });
  const expenseAccounts = accountsData?.data ?? [];
  const listPath = adminListPath("erp/expenses", {
    page,
    storeId,
    period: period !== "all" ? period : undefined,
    accountId: accountId || undefined,
    search: debouncedSearch.trim() || undefined,
  });
  const { data, isPending, refetch } = useAdminGetQuery<{
    data: ErpExpenseListRow[];
    total: number;
    totalAmount: number;
  }>({
    path: listPath,
    enabled: !erpContextLoading,
  });
  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalAmount = data?.totalAmount ?? 0;
  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    rows,
    "expense_date",
    "desc",
  );

  const accountOptions = useMemo(
    () => [
      { value: "", label: "All expense types" },
      ...expenseAccounts.map((a) => ({ value: a.id, label: a.name })),
    ],
    [expenseAccounts],
  );

  const listParams: Record<string, string> = {};
  if (storeId) listParams.storeId = storeId;
  if (period !== "all") listParams.period = period;
  if (accountId) listParams.accountId = accountId;
  if (debouncedSearch.trim()) listParams.search = debouncedSearch.trim();

  async function handleDelete(id: string) {
    if (!confirm("Delete this expense?")) return;
    setDeletingId(id);
    try {
      await adminDelete(`erp/expenses/${id}`);
      await refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Couldn't delete expense");
    } finally {
      setDeletingId(null);
    }
  }

  if (isPending && !data) return <AdminPageSkeleton />;

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title="Expenses"
        breadcrumb={[{ label: "Expenses", href: "/admin/erp/expenses" }]}
        description="Operating expenses and petty cash spend by store. Filter by expense account type or period."
        actions={
          <Button size="sm" onClick={() => openNew()}>
            <Plus data-icon="inline-start" />
            Add expense
          </Button>
        }
      />

      <AdminListCard
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search reference, notes…"
        isEmpty={sorted.length === 0}
        emptyMessage="No expenses found."
        isFiltering={
          Boolean(debouncedSearch.trim()) || Boolean(accountId) || period !== "all"
        }
        onClearFilters={() => {
          setSearch("");
          setAccountId("");
          setPeriod("all");
        }}
        filters={[
          { id: "period", label: "Period", value: period, options: PERIOD_OPTIONS, onChange: setPeriod },
          {
            id: "account",
            label: "Expense type",
            value: accountId,
            options: accountOptions,
            onChange: setAccountId,
          },
        ]}
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <span>{total} expenses</span>
            <span className="font-semibold tabular-nums">
              Total: {formatCurrencyAmount(totalAmount)}
            </span>
          </div>
        }
      >
        <AdminDataTable>
          <AdminTableHeader>
            <SortableTableHead
              label="Date"
              sortKey="expense_date"
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
              label="Expense account"
              sortKey="account_name"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Reference"
              sortKey="reference"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              className="hidden md:table-cell"
            />
            <SortableTableHead
              label="Vendor"
              sortKey="vendor_name"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              className="hidden lg:table-cell"
            />
            <SortableTableHead
              label="Paid through"
              sortKey="paid_through_name"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Customer"
              sortKey="customer_name"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              className="hidden xl:table-cell"
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
            {sorted.map((row) => (
              <AdminTableRow key={row.id}>
                <AdminTableCell className="tabular-nums text-muted-foreground">
                  {formatDisplayDate(row.expense_date)}
                </AdminTableCell>
                <AdminTableCell className="max-w-[140px] truncate text-sm">
                  <ErpStoreTableGlance storeId={row.store_id} name={row.store_name} />
                </AdminTableCell>
                <AdminTableCell>{row.account_name ?? "—"}</AdminTableCell>
                <AdminTableCell className="hidden max-w-[160px] truncate md:table-cell">
                  <ErpDocumentTableGlance
                    triggerLabel={formatErpDocRef("EXP", row.id)}
                    shellLabel="Expense"
                    title={row.expense_number?.trim() || formatErpDocRef("EXP", row.id)}
                    viewHref={`/admin/erp/expenses/${row.id}`}
                    viewLabel="View expense →"
                    stats={[{ label: "Amount", value: formatCurrencyAmount(row.total_amount) }]}
                  />
                </AdminTableCell>
                <AdminTableCell className="hidden lg:table-cell">
                  <ErpVendorTableGlance name={row.vendor_name} />
                </AdminTableCell>
                <AdminTableCell className="text-sm text-muted-foreground">
                  {row.paid_through_name ?? "—"}
                </AdminTableCell>
                <AdminTableCell className="hidden xl:table-cell">
                  <ErpCustomerTableGlance name={row.customer_name} />
                </AdminTableCell>
                <AdminTableCell align="right" className="font-semibold tabular-nums">
                  {formatCurrencyAmount(row.total_amount)}
                </AdminTableCell>
                <AdminTableCell align="right">
                  <ErpListRowActions
                    viewHref={`/admin/erp/expenses/${row.id}`}
                    editHref={`/admin/erp/expenses?form=edit&id=${row.id}`}
                    menuItems={[
                      {
                        label: "Delete",
                        destructive: true,
                        separatorBefore: true,
                        disabled: deletingId === row.id,
                        onClick: () => void handleDelete(row.id),
                      },
                    ]}
                  />
                </AdminTableCell>
              </AdminTableRow>
            ))}
          </AdminTableBody>
          {sorted.length > 0 && (
            <TableFooter>
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="font-medium">
                  Page total
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatCurrencyAmount(sorted.reduce((s, r) => s + r.total_amount, 0))}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          )}
        </AdminDataTable>
      </AdminListCard>

      <Pagination
        page={page}
        total={total}
        basePath="/admin/erp/expenses"
        listParams={listParams}
        pageSize={PAGE_SIZE}
      />

      {isOpen ? (
        <ExpenseFormView
          variant="modal"
          mode={mode}
          expenseId={editId ?? undefined}
          open={modalProps.open}
          onOpenChange={modalProps.onOpenChange}
          onSuccess={() => void refetch()}
        />
      ) : null}
    </AdminPageLayout>
  );
}
