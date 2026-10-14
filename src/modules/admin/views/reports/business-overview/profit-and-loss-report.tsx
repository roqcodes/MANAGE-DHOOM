"use client";

import { useMemo } from "react";

import type { ReportDefinition } from "@/common/erp/report-types";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { AdminTableBodySkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { BusinessReportLayout } from "./business-report-layout";
import {
  exportReportCsv,
  formatReportCell,
  matchesReportSearch,
} from "./report-format";
import {
  StatementLineRow,
  StatementSectionHeader,
  StatementTable,
  StatementTotalRow,
} from "./statement-section";
import { useBusinessReportFilters } from "./use-business-report-filters";
import { useErpReportFetch } from "./use-erp-report-fetch";

type PlLine = {
  account_code?: string;
  account_name?: string;
  amount?: number;
};

export function ProfitAndLossReport({ report }: { report: ReportDefinition }) {
  const filters = useBusinessReportFilters(report);
  const { loading, error, rawData, reload } = useErpReportFetch(report, {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    asOf: filters.asOf,
    storeId: filters.storeId,
    channel: "all",
    accountId: "",
  });

  const data = (rawData ?? {}) as Record<string, unknown>;
  const income = (data.income as PlLine[] | undefined) ?? [];
  const expenses = (data.expenses as PlLine[] | undefined) ?? [];
  const totalIncome = Number(data.total_income ?? 0);
  const totalExpenses = Number(data.total_expenses ?? 0);
  const netProfit = Number(data.net_profit ?? totalIncome - totalExpenses);

  const filteredIncome = useMemo(
    () =>
      income.filter((row) =>
        matchesReportSearch(row as Record<string, unknown>, filters.debouncedSearch),
      ),
    [income, filters.debouncedSearch],
  );
  const filteredExpenses = useMemo(
    () =>
      expenses.filter((row) =>
        matchesReportSearch(row as Record<string, unknown>, filters.debouncedSearch),
      ),
    [expenses, filters.debouncedSearch],
  );

  const isEmpty = !loading && filteredIncome.length === 0 && filteredExpenses.length === 0;

  function exportCsv() {
    const rows = [
      ...filteredIncome.map((r) => ({
        section: "Operating income",
        account_code: r.account_code,
        account_name: r.account_name,
        amount: r.amount,
      })),
      ...filteredExpenses.map((r) => ({
        section: "Operating expense",
        account_code: r.account_code,
        account_name: r.account_name,
        amount: r.amount,
      })),
    ];
    exportReportCsv(report.slug, [
      { key: "section", label: "Section" },
      { key: "account_code", label: "Code" },
      { key: "account_name", label: "Account" },
      { key: "amount", label: "Amount" },
    ], rows);
  }

  return (
    <BusinessReportLayout
      report={report}
      filters={filters}
      loading={loading}
      isEmpty={isEmpty}
      onRefresh={reload}
      onExport={exportCsv}
      showDateRange
    >
      {error ? <p className="px-4 py-3 text-sm text-destructive">{error}</p> : null}
      {loading ? (
        <AdminTableBodySkeleton rows={12} />
      ) : (
        <div className="space-y-6 p-1">
          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryMetric label="Total income" value={totalIncome} />
            <SummaryMetric label="Total expenses" value={totalExpenses} />
            <SummaryMetric label="Net profit / loss" value={netProfit} highlight />
          </div>

          <StatementTable>
            <StatementSectionHeader title="Operating income" />
            {filteredIncome.map((row) => (
              <StatementLineRow
                key={`${row.account_code}-${row.account_name}`}
                label={row.account_name ?? row.account_code ?? "—"}
                amount={Number(row.amount ?? 0)}
                indent
              />
            ))}
            <StatementTotalRow label="Total operating income" amount={totalIncome} />

            <StatementSectionHeader title="Operating expense" />
            {filteredExpenses.map((row) => (
              <StatementLineRow
                key={`${row.account_code}-${row.account_name}`}
                label={row.account_name ?? row.account_code ?? "—"}
                amount={Number(row.amount ?? 0)}
                indent
              />
            ))}
            <StatementTotalRow label="Total operating expense" amount={totalExpenses} />

            <StatementTotalRow label="Net profit / loss" amount={netProfit} emphasis />
          </StatementTable>
        </div>
      )}
    </BusinessReportLayout>
  );
}

function SummaryMetric({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-lg font-semibold tabular-nums ${highlight && value < 0 ? "text-destructive" : ""}`}
      >
        {formatReportCell(value, "currency")}
      </p>
    </div>
  );
}
