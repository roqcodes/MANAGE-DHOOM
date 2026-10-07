"use client";

import { useEffect, useState } from "react";

import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { formatCurrencyAmount } from "@/lib/format-currency";
import type {
  AccountTransactionRow,
  BankingAccountRow,
  JournalEntryListRow,
} from "@/common/erp/finance-types";

function SimpleTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: (string | number)[][];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-3 py-2">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-slate-100">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminJournalEntriesView() {
  const [rows, setRows] = useState<JournalEntryListRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    adminGet<{ data: JournalEntryListRow[] }>("erp/journal-entries?page=0")
      .then((res) => setRows(res.data))
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <p className="p-4 text-sm">Loading…</p>;
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-lg font-semibold">Journal Entries</h1>
      <SimpleTable
        headers={["Number", "Date", "Description", "Source", "Debit", "Credit", "Store"]}
        rows={rows.map((r) => [
          r.journal_number,
          r.transaction_date,
          r.description,
          r.source_entity_type ?? "—",
          formatCurrencyAmount(r.total_debit),
          formatCurrencyAmount(r.total_credit),
          r.store_name ?? "—",
        ])}
      />
    </div>
  );
}

export function AdminBankingView() {
  const [accounts, setAccounts] = useState<BankingAccountRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<AccountTransactionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminGet<{ data: BankingAccountRow[] }>("erp/banking")
      .then((res) => {
        setAccounts(res.data);
        if (res.data[0]) setSelectedId(res.data[0].id);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    adminGet<{ data: AccountTransactionRow[] }>(`erp/banking?accountId=${selectedId}`)
      .then((res) => setTransactions(res.data));
  }, [selectedId]);

  if (loading) return <p className="p-4 text-sm">Loading…</p>;

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-lg font-semibold">Banking</h1>
      <SimpleTable
        headers={["Account", "Code", "Type", "Balance"]}
        rows={accounts.map((r) => [
          r.name,
          r.code,
          r.account_type_name,
          formatCurrencyAmount(r.current_balance),
        ])}
      />
      <div className="flex flex-wrap gap-2">
        {accounts.map((a) => (
          <button
            key={a.id}
            type="button"
            className={`rounded border px-2 py-1 text-xs ${selectedId === a.id ? "bg-slate-900 text-white" : "bg-white"}`}
            onClick={() => setSelectedId(a.id)}
          >
            {a.name}
          </button>
        ))}
      </div>
      <h2 className="text-sm font-semibold">Account Transactions</h2>
      <SimpleTable
        headers={["Number", "Date", "Type", "Details", "Debit", "Credit", "Balance"]}
        rows={transactions.map((t) => [
          t.transaction_number,
          t.transaction_date,
          t.transaction_type,
          t.details,
          formatCurrencyAmount(t.debit_amount),
          formatCurrencyAmount(t.credit_amount),
          t.running_balance != null ? formatCurrencyAmount(t.running_balance) : "—",
        ])}
      />
    </div>
  );
}

/** Reconciliation ERP page */
export { AdminReconciliationView } from "@/modules/admin/views/finance/reconciliation-view";

export function AdminErpFinancialSummaryView() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    adminGet<Record<string, unknown>>("erp/finance-dashboard")
      .then(setData)
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <p className="p-4 text-sm">Loading…</p>;
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-lg font-semibold">Financial Summary</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Accounts Receivable", data?.accounts_receivable],
          ["Accounts Payable", data?.accounts_payable],
          ["Net Income YTD", data?.net_income_ytd],
          ["Net Profit YTD", data?.net_profit_ytd],
          ["COGS YTD", data?.cogs_ytd],
          ["Expenses YTD", data?.expenses_ytd],
          ["Low Stock Items", data?.low_stock_count],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-lg border p-3">
            <p className="text-xs text-slate-500">{label as string}</p>
            <p className="text-lg font-semibold">
              {typeof value === "number" && label !== "Low Stock Items"
                ? formatCurrencyAmount(value as number)
                : String(value ?? "—")}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

