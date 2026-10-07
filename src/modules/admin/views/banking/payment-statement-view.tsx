"use client";

import { useEffect, useMemo, useState } from "react";

import type { BankingAccountRow, PaymentStatementRow } from "@/common/erp/finance-types";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  SalesListCard,
  SalesLoadingState,
  SalesPageHeader,
  SalesPageLayout,
} from "@/modules/erp/components/sales-module-ui";
import { SortableTableHead, useSortableData } from "@/modules/admin/ui";
import { useActiveStoreScope } from "@/modules/erp/components/use-active-store-scope";
import { useErpStores } from "@/modules/erp/components/use-erp-stores";
import { formatBankingType } from "@/modules/admin/views/banking/banking-ui";

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

export function PaymentStatementView() {
  const { stores } = useErpStores();
  const { activeStoreId, storeId } = useActiveStoreScope();
  const [accounts, setAccounts] = useState<BankingAccountRow[]>([]);
  const [rows, setRows] = useState<PaymentStatementRow[]>([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [totals, setTotals] = useState({ debit: 0, credit: 0, balance: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [accountId, setAccountId] = useState("");
  const [period, setPeriod] = useState("this_month");

  useEffect(() => {
    const q = storeId ? `?storeId=${encodeURIComponent(storeId)}` : "";
    adminGet<{ data: BankingAccountRow[] }>(`erp/banking${q}`).then((res) =>
      setAccounts(res.data ?? []),
    );
  }, [storeId]);

  useEffect(() => {
    setLoading(true);
    const dates = periodToDates(period);
    const q = new URLSearchParams({ view: "payment-statement" });
    if (storeId) q.set("storeId", storeId);
    if (accountId) q.set("accountId", accountId);
    if (dates.dateFrom) q.set("dateFrom", dates.dateFrom);
    if (dates.dateTo) q.set("dateTo", dates.dateTo);
    if (search.trim()) q.set("search", search.trim());

    adminGet<{
      rows: PaymentStatementRow[];
      openingBalance: number;
      totals: { debit: number; credit: number; balance: number };
    }>(`erp/banking?${q.toString()}`)
      .then((res) => {
        setRows(res.rows ?? []);
        setOpeningBalance(res.openingBalance ?? 0);
        setTotals(res.totals ?? { debit: 0, credit: 0, balance: 0 });
      })
      .finally(() => setLoading(false));
  }, [storeId, accountId, period, search]);

  const selectedStoreLabel = useMemo(
    () => stores.find((s) => s.id === storeId)?.name ?? "Selected store",
    [stores, storeId],
  );
  const selectedAccountLabel = useMemo(
    () => accounts.find((a) => a.id === accountId)?.name ?? "All payment accounts",
    [accounts, accountId],
  );
  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    rows,
    "transaction_date",
    "desc",
  );

  if (loading && rows.length === 0) return <SalesLoadingState />;

  return (
    <SalesPageLayout>
      <SalesPageHeader
        title="Payment account statements"
        description="Ledger of deposits, withdrawals, and running balances across payment accounts."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Card size="sm">
          <CardContent className="flex items-center text-sm">
            <span className="text-muted-foreground">Selected store: </span>
            <span className="font-medium">{selectedStoreLabel}</span>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="flex items-center text-sm">
            <span className="text-muted-foreground">Selected account: </span>
            <span className="font-medium">{selectedAccountLabel}</span>
          </CardContent>
        </Card>
      </div>

      <SalesListCard
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search transaction, account, store…"
        filters={[
          {
            label: "Account",
            value: accountId,
            options: [
              { value: "", label: "All accounts" },
              ...accounts.map((a) => ({ value: a.id, label: a.name })),
            ],
            onChange: setAccountId,
          },
          {
            label: "Period",
            value: period,
            options: PERIOD_OPTIONS,
            onChange: setPeriod,
          },
        ]}
        isEmpty={rows.length === 0}
        emptyMessage="No transactions found for this filter."
        isFiltering={Boolean(search.trim() || accountId || period !== "all")}
        onClearFilters={() => {
          setSearch("");
          setAccountId("");
          setPeriod("all");
        }}
        footer={<span>{rows.length} transactions</span>}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
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
                label="Account"
                sortKey="account_name"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableTableHead
                label="Type"
                sortKey="transaction_type"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableTableHead
                label="Details"
                sortKey="details"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="hidden lg:table-cell"
              />
              <SortableTableHead
                label="Payment type"
                sortKey="payment_type"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="hidden md:table-cell"
              />
              <SortableTableHead
                label="Debit"
                sortKey="debit_amount"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                align="right"
              />
              <SortableTableHead
                label="Credit"
                sortKey="credit_amount"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                align="right"
              />
              <SortableTableHead
                label="Balance"
                sortKey="running_balance"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                align="right"
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="bg-muted/30">
              <TableCell />
              <TableCell colSpan={6} className="text-sm font-medium">
                Opening balance
              </TableCell>
              <TableCell />
              <TableCell />
              <TableCell className="text-right font-medium tabular-nums">
                {formatCurrencyAmount(openingBalance)}
              </TableCell>
            </TableRow>
            {sorted.map((row, index) => (
              <TableRow key={row.id}>
                <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                <TableCell className="text-sm">{row.transaction_date}</TableCell>
                <TableCell className="text-sm">{row.store_name ?? "—"}</TableCell>
                <TableCell className="text-sm font-medium">{row.account_name}</TableCell>
                <TableCell className="text-sm">{formatBankingType(row.transaction_type)}</TableCell>
                <TableCell className="hidden max-w-[200px] truncate text-sm text-muted-foreground lg:table-cell">
                  {row.details || "—"}
                </TableCell>
                <TableCell className="hidden text-sm md:table-cell">
                  {row.payment_type ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.debit_amount > 0 ? formatCurrencyAmount(row.debit_amount) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.credit_amount > 0 ? formatCurrencyAmount(row.credit_amount) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {row.running_balance != null
                    ? formatCurrencyAmount(row.running_balance)
                    : "—"}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/30 font-semibold">
              <TableCell colSpan={7} />
              <TableCell className="text-right tabular-nums">
                {formatCurrencyAmount(totals.debit)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrencyAmount(totals.credit)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrencyAmount(totals.balance)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </SalesListCard>
    </SalesPageLayout>
  );
}
