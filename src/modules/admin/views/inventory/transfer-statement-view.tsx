"use client";

import { useEffect, useState } from "react";

import type { TransferStatementSummary } from "@/common/erp/inventory-types";
import { AdminTableBodySkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { adminListPath, useAdminGetQuery } from "@/modules/admin/lib/use-admin-get-query";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StoreSelect, useErpStores } from "@/modules/erp/components/use-erp-stores";

export function TransferStatementView() {
  const { stores, activeStoreId, loading: erpContextLoading } = useErpStores();
  const [fromStoreId, setFromStoreId] = useState("");
  const [toStoreId, setToStoreId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (activeStoreId && !fromStoreId) setFromStoreId(activeStoreId);
  }, [activeStoreId, fromStoreId]);

  const listPath = adminListPath("erp/transfer-statement", {
    fromStoreId,
    toStoreId: toStoreId || undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
  });
  const { data: summary, isPending } = useAdminGetQuery<TransferStatementSummary>({
    path: listPath,
    enabled: !erpContextLoading && Boolean(fromStoreId),
  });
  const loading = isPending && !summary;

  const lines = (summary?.lines ?? []).filter((line) => {
    if (!search.trim()) return true;
    const s = search.trim().toLowerCase();
    return line.reference.toLowerCase().includes(s) || line.type.toLowerCase().includes(s);
  });

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      <h1 className="text-lg font-semibold">Stock Transfer Statement</h1>

      <div className="flex flex-wrap gap-3">
        <StoreSelect value={fromStoreId} onChange={setFromStoreId} stores={stores} label="From Store" />
        <StoreSelect value={toStoreId} onChange={setToStoreId} stores={stores} allowAll label="To Store" />
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">From date</span>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">To date</span>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </label>
        <Input
          placeholder="Search reference…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs self-end"
        />
      </div>

      {summary ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-500">Stock Out</CardTitle>
            </CardHeader>
            <CardContent className="text-lg font-semibold tabular-nums">
              {summary.totalStockOut}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-500">Stock In</CardTitle>
            </CardHeader>
            <CardContent className="text-lg font-semibold tabular-nums">
              {summary.totalStockIn}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-500">Total Amount</CardTitle>
            </CardHeader>
            <CardContent className="text-lg font-semibold tabular-nums">
              {formatCurrencyAmount(summary.totalAmount)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-500">Payment Balance</CardTitle>
            </CardHeader>
            <CardContent className="text-lg font-semibold tabular-nums">
              {formatCurrencyAmount(summary.paymentBalance)}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {loading ? (
        <AdminTableBodySkeleton rows={10} />
      ) : lines.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-slate-500">
          No transactions for the selected filters.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Reference</th>
                <th className="px-3 py-2">Stock Out</th>
                <th className="px-3 py-2">Stock In</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Payments</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={`${line.reference}-${i}`} className="border-t border-slate-100">
                  <td className="px-3 py-2">{line.date}</td>
                  <td className="px-3 py-2">{line.type}</td>
                  <td className="px-3 py-2 font-medium">{line.reference}</td>
                  <td className="px-3 py-2 tabular-nums">{line.stock_out || "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{line.stock_in || "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{formatCurrencyAmount(line.amount)}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {line.payments ? formatCurrencyAmount(line.payments) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
