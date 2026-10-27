"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Coins,
} from "lucide-react";

import type {
  AccountStoreBalanceRow,
  AccountTransactionRow,
  BankingAccountRow,
} from "@/common/erp/finance-types";
import { adminGet, adminPost } from "@/modules/admin/lib/admin-api-client";
import { AdminBreadcrumb } from "@/modules/admin/components/admin-breadcrumb";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  SalesLoadingState,
  SalesPageLayout,
} from "@/modules/erp/components/sales-module-ui";
import { SortableTableHead, AdminTableDateTime, useSortableData } from "@/modules/admin/ui";
import { useErpStores } from "@/modules/erp/components/use-erp-stores";
import {
  BalanceBadge,
  bankingTxToolbarInButtonClass,
  bankingTxToolbarOutButtonClass,
  formatBankingType,
} from "@/modules/admin/views/banking/banking-ui";
import { BankingTransactionFormModal } from "@/modules/admin/views/banking/banking-transaction-form-modal";

type TxKind = "owner_contribution" | "owner_drawing" | "generic" | "account_transfer";

const TX_KINDS: TxKind[] = [
  "owner_contribution",
  "owner_drawing",
  "generic",
  "account_transfer",
];

function isTxKind(value: string | null): value is TxKind {
  return value !== null && TX_KINDS.includes(value as TxKind);
}

export function AccountTransactionsView({ accountId }: { accountId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { stores, activeStoreId } = useErpStores();
  const [account, setAccount] = useState<BankingAccountRow | null>(null);
  const [transactions, setTransactions] = useState<AccountTransactionRow[]>([]);
  const [storeBalances, setStoreBalances] = useState<AccountStoreBalanceRow[]>([]);
  const [allAccounts, setAllAccounts] = useState<BankingAccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [storeFilter, setStoreFilter] = useState(activeStoreId ?? "");
  const [txOpen, setTxOpen] = useState(false);
  const [txKind, setTxKind] = useState<TxKind>("owner_contribution");
  const [genericDirection, setGenericDirection] = useState<"in" | "out">("in");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    transactions,
    "transaction_date",
    "desc",
    (row, key) => {
      if (key === "reference") return row.reference || row.details || row.transaction_type;
      return (row as unknown as Record<string, unknown>)[key];
    },
  );

  function reload() {
    const q = storeFilter ? `&storeId=${storeFilter}` : "";
    const listQ = activeStoreId ? `?storeId=${encodeURIComponent(activeStoreId)}` : "";
    return Promise.all([
      adminGet<{
        account: BankingAccountRow;
        data: AccountTransactionRow[];
        storeBalances: AccountStoreBalanceRow[];
      }>(`erp/banking?accountId=${accountId}${q}`),
      adminGet<{ data: BankingAccountRow[] }>(`erp/banking${listQ}`),
    ]).then(([detail, accountsRes]) => {
      setAccount(detail.account);
      setTransactions(detail.data ?? []);
      setStoreBalances(detail.storeBalances ?? []);
      setAllAccounts(accountsRes.data ?? []);
    });
  }

  useEffect(() => {
    if (activeStoreId) setStoreFilter(activeStoreId);
  }, [activeStoreId]);

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, [accountId, storeFilter]);

  useEffect(() => {
    if (loading) return;
    const tx = searchParams.get("tx");
    if (!isTxKind(tx)) return;

    const direction = searchParams.get("direction");
    setTxKind(tx);
    if (tx === "generic" && (direction === "in" || direction === "out")) {
      setGenericDirection(direction);
    }
    setError(null);
    setTxOpen(true);

    const params = new URLSearchParams(searchParams.toString());
    params.delete("tx");
    params.delete("direction");
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : `/admin/erp/banking/${accountId}`, { scroll: false });
  }, [loading, searchParams, router, accountId]);

  function openTransaction(kind: TxKind, direction?: "in" | "out") {
    setTxKind(kind);
    if (kind === "generic") {
      setGenericDirection(direction ?? "in");
    }
    setError(null);
    setTxOpen(true);
  }

  function handleTransaction(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const storeId = fd.get("storeId") as string;
    const amount = parseFloat((fd.get("amount") as string) || "0");
    if (!storeId || amount <= 0) {
      setError("Store and amount are required");
      return;
    }

    const payload = {
      accountId,
      storeId,
      transactionDate: (fd.get("transactionDate") as string) || new Date().toISOString().slice(0, 10),
      transactionType: txKind,
      counterAccountId: (fd.get("counterAccountId") as string) || undefined,
      details: (fd.get("description") as string).trim() || undefined,
      paymentType: (fd.get("paymentType") as string) || "Cash",
      reference: (fd.get("reference") as string).trim() || undefined,
      debitAmount:
        txKind === "owner_contribution" ||
        (txKind === "generic" && fd.get("direction") === "in")
          ? amount
          : 0,
      creditAmount:
        txKind === "owner_drawing" ||
        txKind === "account_transfer" ||
        (txKind === "generic" && fd.get("direction") === "out")
          ? amount
          : 0,
    };

    startTransition(async () => {
      try {
        await adminPost("erp/banking", payload);
        setTxOpen(false);
        await reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save transaction");
      }
    });
  }

  if (loading) return <SalesLoadingState />;

  if (!account) {
    return (
      <SalesPageLayout>
        <p className="text-sm text-destructive">Account not found.</p>
      </SalesPageLayout>
    );
  }

  return (
    <SalesPageLayout>
      <AdminBreadcrumb
        backHref="/admin/erp/banking"
        items={[
          { label: "Cash accounts", href: "/admin/erp/banking" },
          { label: account.name },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{account.name}</h1>
          <p className="text-sm text-muted-foreground">
            {account.code} · {account.account_type_name}
          </p>
        </div>
        <div
          className="flex max-w-full shrink-0 flex-nowrap items-center gap-1 overflow-x-auto rounded-xl border border-border/70 bg-gradient-to-b from-muted/45 to-muted/20 p-1 shadow-xs sm:gap-1.5"
          role="toolbar"
          aria-label="Record cash transaction"
        >
          <span
            className="shrink-0 px-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary/80"
          >
            In
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={bankingTxToolbarInButtonClass}
            onClick={() => openTransaction("owner_contribution")}
          >
            <ArrowDownLeft data-icon="inline-start" className="size-4" />
            <span className="whitespace-nowrap">Owner&apos;s contribution</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={bankingTxToolbarInButtonClass}
            onClick={() => openTransaction("generic", "in")}
          >
            <Coins data-icon="inline-start" className="size-4" />
            <span className="whitespace-nowrap">Other income</span>
          </Button>
          <span className="mx-0.5 h-6 w-px shrink-0 bg-border/80" aria-hidden />
          <span
            className="shrink-0 px-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Out
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={bankingTxToolbarOutButtonClass}
            onClick={() => openTransaction("owner_drawing")}
          >
            <ArrowUpRight data-icon="inline-start" className="size-4" />
            <span className="whitespace-nowrap">Owner&apos;s drawings</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={bankingTxToolbarOutButtonClass}
            onClick={() => openTransaction("account_transfer")}
          >
            <ArrowLeftRight data-icon="inline-start" className="size-4" />
            <span className="whitespace-nowrap">Transfer</span>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Account summary</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-sm">Current balance</span>
            <BalanceBadge amount={account.current_balance} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Balance breakdown</CardTitle>
            <p className="text-xs text-muted-foreground">
              Opening balance and other GL are from the ledger; store rows match the cash book.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {storeBalances.length === 0 ? (
              <p className="text-sm text-muted-foreground">No breakdown yet.</p>
            ) : (
              storeBalances.map((row) => (
                <div
                  key={row.row_kind ?? row.store_id ?? row.store_name}
                  className="flex justify-between text-sm"
                >
                  <span
                    className={
                      row.row_kind === "opening" || row.row_kind === "other_gl"
                        ? "text-muted-foreground"
                        : undefined
                    }
                  >
                    {row.store_name}
                  </span>
                  <span className="tabular-nums font-medium">
                    {formatCurrencyAmount(row.balance)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-2 border-b sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div>
            <CardTitle>Transactions</CardTitle>
            {storeFilter ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Filtered by store. Balance column is movement for this store only; current
                balance above is opening + other GL + all store cash-book activity.
              </p>
            ) : null}
          </div>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
          >
            <option value="">All stores</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </CardHeader>
        <CardContent className="p-0">
          {transactions.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No transactions found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
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
                    className="hidden md:table-cell"
                  />
                  <SortableTableHead
                    label="Reference"
                    sortKey="reference"
                    activeKey={sortKey}
                    direction={sortDirection}
                    onSort={toggleSort}
                  />
                  <SortableTableHead
                    label="Deposit"
                    sortKey="debit_amount"
                    activeKey={sortKey}
                    direction={sortDirection}
                    onSort={toggleSort}
                    align="right"
                  />
                  <SortableTableHead
                    label="Withdrawal"
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
                {sorted.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="text-sm text-muted-foreground">
                      <AdminTableDateTime documentDate={tx.transaction_date} activity={tx} />
                    </TableCell>
                    <TableCell className="hidden text-sm md:table-cell">
                      {tx.store_name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">{formatBankingType(tx.transaction_type)}</p>
                        <p className="text-xs text-muted-foreground">
                          {tx.reference || tx.details || "—"}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {tx.debit_amount > 0 ? formatCurrencyAmount(tx.debit_amount) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {tx.credit_amount > 0 ? formatCurrencyAmount(tx.credit_amount) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {tx.running_balance != null
                        ? formatCurrencyAmount(tx.running_balance)
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <BankingTransactionFormModal
        open={txOpen}
        onOpenChange={setTxOpen}
        account={account}
        accountId={accountId}
        txKind={txKind}
        genericDirection={genericDirection}
        onGenericDirectionChange={setGenericDirection}
        stores={stores}
        defaultStoreId={storeFilter || activeStoreId || ""}
        allAccounts={allAccounts}
        pending={pending}
        error={error}
        onSubmit={handleTransaction}
      />
    </SalesPageLayout>
  );
}
