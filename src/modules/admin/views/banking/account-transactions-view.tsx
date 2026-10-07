"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Plus } from "lucide-react";

import type {
  AccountStoreBalanceRow,
  AccountTransactionRow,
  BankingAccountRow,
} from "@/common/erp/finance-types";
import { PAYMENT_MODE_OPTIONS } from "@/common/erp/finance-types";
import { adminGet, adminPost } from "@/modules/admin/lib/admin-api-client";
import { AdminBreadcrumb } from "@/modules/admin/components/admin-breadcrumb";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { SortableTableHead, useSortableData } from "@/modules/admin/ui";
import { useErpStores } from "@/modules/erp/components/use-erp-stores";
import {
  BalanceBadge,
  formatBankingType,
} from "@/modules/admin/views/banking/banking-ui";

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

  function openTransaction(kind: TxKind) {
    setTxKind(kind);
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

  const txTitle =
    txKind === "owner_contribution"
      ? "Owner's contribution"
      : txKind === "owner_drawing"
        ? "Owner's drawings"
        : txKind === "account_transfer"
          ? "Transfer to another account"
          : "Other income";

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
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="sm" />}>
            <Plus data-icon="inline-start" />
            Add transaction
            <ChevronDown />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Money in</p>
              <DropdownMenuItem onClick={() => openTransaction("owner_contribution")}>
                Owner&apos;s contribution
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openTransaction("generic")}>
                Other income
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuGroup>
              <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Money out</p>
              <DropdownMenuItem onClick={() => openTransaction("owner_drawing")}>
                Owner&apos;s drawings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openTransaction("account_transfer")}>
                Transfer to account
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
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
            <CardTitle className="text-sm text-muted-foreground">Store-wise balance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {storeBalances.length === 0 ? (
              <p className="text-sm text-muted-foreground">No store breakdown yet.</p>
            ) : (
              storeBalances.map((row) => (
                <div key={row.store_id ?? row.store_name} className="flex justify-between text-sm">
                  <span>{row.store_name}</span>
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
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b">
          <CardTitle>Transactions</CardTitle>
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
                      {tx.transaction_date}
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

      <Dialog open={txOpen} onOpenChange={setTxOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{txTitle}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleTransaction} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Store *</Label>
              <select name="storeId" className="h-9 w-full rounded-md border px-3 text-sm" required>
                <option value="">Select store</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            {txKind === "owner_drawing" ? (
              <div className="space-y-2 sm:col-span-2">
                <Label>To account</Label>
                <select
                  name="counterAccountId"
                  className="h-9 w-full rounded-md border px-3 text-sm"
                  defaultValue=""
                >
                  <option value="">Drawings (default)</option>
                  {allAccounts
                    .filter((a) => a.id !== accountId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
              </div>
            ) : (
              <div className="space-y-2 sm:col-span-2">
                <Label>{txKind === "account_transfer" ? "Transfer to account *" : "From account"}</Label>
                <select
                  name="counterAccountId"
                  className="h-9 w-full rounded-md border px-3 text-sm"
                  defaultValue=""
                  required={txKind === "account_transfer"}
                >
                  <option value="">Select</option>
                  {allAccounts
                    .filter((a) => a.id !== accountId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input
                name="transactionDate"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Amount *</Label>
              <Input name="amount" type="number" step="0.01" min={0} defaultValue={0} required />
            </div>
            {txKind === "generic" ? (
              <div className="space-y-2 sm:col-span-2">
                <Label>Direction</Label>
                <select
                  name="direction"
                  className="h-9 w-full rounded-md border px-3 text-sm"
                  value={genericDirection}
                  onChange={(e) => setGenericDirection(e.target.value as "in" | "out")}
                >
                  <option value="in">Money in</option>
                  <option value="out">Money out</option>
                </select>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label>{txKind === "owner_contribution" ? "Received via" : "Paid via"}</Label>
              <select name="paymentType" className="h-9 w-full rounded-md border px-3 text-sm" defaultValue="Cash">
                {PAYMENT_MODE_OPTIONS.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Reference #</Label>
              <Input name="reference" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Description</Label>
              <Textarea name="description" rows={3} />
            </div>
            {error ? <p className="text-sm text-destructive sm:col-span-2">{error}</p> : null}
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setTxOpen(false)}>
                Close
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </SalesPageLayout>
  );
}
