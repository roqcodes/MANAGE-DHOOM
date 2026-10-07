"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";

import type { BankingAccountRow, ProfitWithdrawalRow } from "@/common/erp/finance-types";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { formatErpDocRef } from "@/lib/erp-document-ref";
import { Button } from "@/components/ui/button";
import { TableFooter, TableCell, TableRow } from "@/components/ui/table";
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
import { ProfitWithdrawalFormView } from "@/modules/admin/views/banking/profit-withdrawal-form-view";

const PERIOD_OPTIONS = [
  { value: "all", label: "All dates" },
  { value: "today", label: "Today" },
  { value: "this_month", label: "This month" },
];

function periodToDates(period: string) {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (period === "today") {
    const d = iso(today);
    return { dateFrom: d, dateTo: d };
  }
  if (period === "this_month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { dateFrom: iso(start), dateTo: iso(today) };
  }
  return {};
}

export function ProfitWithdrawalsListView() {
  const { activeStoreId, storeId } = useActiveStoreScope();
  const { isOpen, modalProps, openNew } = useErpFormModal("/admin/erp/profit-withdrawals");
  const [reloadToken, setReloadToken] = useState(0);
  const [accounts, setAccounts] = useState<BankingAccountRow[]>([]);
  const [rows, setRows] = useState<ProfitWithdrawalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [accountId, setAccountId] = useState("");
  const [period, setPeriod] = useState("today");
  const debouncedSearch = useDebouncedValue(search, 350);
  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    rows,
    "transaction_date",
    "desc",
  );

  useEffect(() => {
    const q = storeId ? `?storeId=${encodeURIComponent(storeId)}` : "";
    adminGet<{ data: BankingAccountRow[] }>(`erp/banking${q}`).then((res) =>
      setAccounts(res.data ?? []),
    );
  }, [storeId]);

  useEffect(() => {
    setLoading(true);
    const dates = periodToDates(period);
    const q = new URLSearchParams({ view: "profit-withdrawals" });
    if (storeId) q.set("storeId", storeId);
    if (accountId) q.set("accountId", accountId);
    if (dates.dateFrom) q.set("dateFrom", dates.dateFrom);
    if (dates.dateTo) q.set("dateTo", dates.dateTo);
    if (debouncedSearch.trim()) q.set("search", debouncedSearch.trim());

    adminGet<{ data: ProfitWithdrawalRow[] }>(`erp/banking?${q.toString()}`)
      .then((res) => {
        setRows(res.data ?? []);
      })
      .finally(() => setLoading(false));
  }, [storeId, accountId, period, debouncedSearch, reloadToken]);

  const amountTotal = useMemo(
    () => sorted.reduce((sum, row) => sum + row.amount, 0),
    [sorted],
  );

  if (loading && rows.length === 0) return <AdminPageSkeleton />;

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title="Profit withdrawals"
        breadcrumb={[{ label: "Profit withdrawal", href: "/admin/erp/profit-withdrawals" }]}
        description="Owner profit withdrawals from payment accounts."
        actions={
          <Button size="sm" onClick={() => openNew()}>
            <Plus data-icon="inline-start" />
            Add withdrawal
          </Button>
        }
      />

      <AdminListCard
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search number, account, reference…"
        filters={[
          {
            id: "account",
            label: "Account",
            value: accountId,
            options: [
              { value: "", label: "All accounts" },
              ...accounts.map((a) => ({ value: a.id, label: a.name })),
            ],
            onChange: setAccountId,
          },
          {
            id: "period",
            label: "Period",
            value: period,
            options: PERIOD_OPTIONS,
            onChange: setPeriod,
          },
        ]}
        isEmpty={sorted.length === 0}
        emptyMessage="No profit withdrawals found."
        isFiltering={Boolean(debouncedSearch.trim() || accountId || period !== "all")}
        onClearFilters={() => {
          setSearch("");
          setAccountId("");
          setPeriod("all");
        }}
        footer={
          <span>
            {sorted.length} withdrawals · Total {formatCurrencyAmount(amountTotal)}
          </span>
        }
      >
        <AdminDataTable>
          <AdminTableHeader>
            <SortableTableHead
              label="Number"
              sortKey="transaction_number"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Date"
              sortKey="transaction_date"
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
              label="From"
              sortKey="from_account_name"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="To"
              sortKey="to_account_name"
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
              label="Description"
              sortKey="details"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              className="hidden lg:table-cell"
            />
            <SortableTableHead
              label="Amount"
              sortKey="amount"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              align="right"
            />
          </AdminTableHeader>
          <AdminTableBody>
            {sorted.map((row) => (
              <AdminTableRow key={row.id}>
                <AdminTableCell className="font-mono text-sm">
                  <span title={row.transaction_number}>{formatErpDocRef("PW", row.id)}</span>
                </AdminTableCell>
                <AdminTableCell className="text-muted-foreground">{row.transaction_date}</AdminTableCell>
                <AdminTableCell>{row.store_name ?? "—"}</AdminTableCell>
                <AdminTableCell className="font-medium">{row.from_account_name}</AdminTableCell>
                <AdminTableCell>{row.to_account_name ?? "Drawings"}</AdminTableCell>
                <AdminTableCell className="hidden md:table-cell">{row.reference ?? "—"}</AdminTableCell>
                <AdminTableCell className="hidden max-w-[200px] truncate text-muted-foreground lg:table-cell">
                  {row.details || "—"}
                </AdminTableCell>
                <AdminTableCell align="right" className="font-semibold tabular-nums">
                  {formatCurrencyAmount(row.amount)}
                </AdminTableCell>
              </AdminTableRow>
            ))}
          </AdminTableBody>
          {sorted.length > 0 ? (
            <TableFooter>
              <TableRow className="bg-muted/30 font-semibold">
                <TableCell colSpan={7} className="text-right">
                  Total withdrawals
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrencyAmount(amountTotal)}
                </TableCell>
              </TableRow>
            </TableFooter>
          ) : null}
        </AdminDataTable>
      </AdminListCard>

      {isOpen ? (
        <ProfitWithdrawalFormView
          variant="modal"
          open={modalProps.open}
          onOpenChange={modalProps.onOpenChange}
          onSuccess={() => setReloadToken((t) => t + 1)}
        />
      ) : null}
    </AdminPageLayout>
  );
}
