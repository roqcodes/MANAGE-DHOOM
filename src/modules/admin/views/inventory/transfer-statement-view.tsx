"use client";

import { useEffect, useState } from "react";

import type { TransferStatementSummary } from "@/common/erp/inventory-types";
import { AdminTableBodySkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { adminListPath, useAdminGetQuery } from "@/modules/admin/lib/use-admin-get-query";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StoreSelect, useErpStores } from "@/modules/erp/components/use-erp-stores";
import {
  AdminListCard,
  AdminPageHeader,
  AdminPageLayout,
  useAdminDateRange,
} from "@/modules/admin/ui";

export function TransferStatementView() {
  const { stores, activeStoreId, loading: erpContextLoading } = useErpStores();
  const [fromStoreId, setFromStoreId] = useState("");
  const [toStoreId, setToStoreId] = useState("");
  const { listParams: dateParams, clearDateRange, isDateFiltering } =
    useAdminDateRange();
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (activeStoreId && !fromStoreId) setFromStoreId(activeStoreId);
  }, [activeStoreId, fromStoreId]);

  const listPath = adminListPath("erp/transfer-statement", {
    fromStoreId,
    toStoreId: toStoreId || undefined,
    fromDate: dateParams.dateFrom,
    toDate: dateParams.dateTo,
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
    <AdminPageLayout>
      <AdminPageHeader
        title="Stock transfer statement"
        description="Stock movements and payments between stores for the selected range."
      />

      <div className="flex flex-wrap gap-3">
        <StoreSelect value={fromStoreId} onChange={setFromStoreId} stores={stores} label="From store" />
        <StoreSelect value={toStoreId} onChange={setToStoreId} stores={stores} allowAll label="To store" />
      </div>

      {summary ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Stock out</CardTitle>
            </CardHeader>
            <CardContent className="text-lg font-semibold tabular-nums">
              {summary.totalStockOut}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Stock in</CardTitle>
            </CardHeader>
            <CardContent className="text-lg font-semibold tabular-nums">
              {summary.totalStockIn}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Total amount</CardTitle>
            </CardHeader>
            <CardContent className="text-lg font-semibold tabular-nums">
              {formatCurrencyAmount(summary.totalAmount)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Payment balance</CardTitle>
            </CardHeader>
            <CardContent className="text-lg font-semibold tabular-nums">
              {formatCurrencyAmount(summary.paymentBalance)}
            </CardContent>
          </Card>
        </div>
      ) : null}

      <AdminListCard
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search reference…"
        isEmpty={!loading && lines.length === 0}
        emptyMessage="No transactions for the selected filters."
        isFiltering={Boolean(search.trim()) || isDateFiltering}
        onClearFilters={() => {
          setSearch("");
          clearDateRange();
        }}
      >
        {loading ? (
          <AdminTableBodySkeleton rows={10} />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Reference</th>
                  <th className="px-3 py-2">Stock out</th>
                  <th className="px-3 py-2">Stock in</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Payments</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => (
                  <tr key={`${line.reference}-${i}`} className="border-t border-border/60">
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
      </AdminListCard>
    </AdminPageLayout>
  );
}
