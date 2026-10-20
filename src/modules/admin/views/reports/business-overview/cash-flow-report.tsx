"use client";

import { useMemo, useState } from "react";

import type { ReportDefinition } from "@/common/erp/report-types";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { AdminTableBodySkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BusinessReportLayout } from "./business-report-layout";
import { buildReportExportSource, matchesReportSearch, reportFiltersSubtitle } from "./report-format";
import {
  StatementLineRow,
  StatementSectionHeader,
  StatementSubsectionHeader,
  StatementTable,
  StatementTotalRow,
} from "./statement-section";
import { useBusinessReportFilters } from "./use-business-report-filters";
import { useErpReportFetch } from "./use-erp-report-fetch";
import { ErrorsFeedbackBridge } from "@/modules/feedback/components/errors-feedback-bridge";

type CfLine = {
  account_code?: string;
  account_name?: string;
  account_type_name?: string;
  amount?: number;
};

type CfSection = {
  lines?: CfLine[];
  total?: number;
};

type SortMode = "account" | "amount";

export function CashFlowReport({ report }: { report: ReportDefinition }) {
  const filters = useBusinessReportFilters(report);
  const { loading, error, rawData, reload } = useErpReportFetch(report, {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    asOf: filters.asOf,
    storeId: filters.storeId,
    channel: "all",
    accountId: "",
  });

  const [sortMode, setSortMode] = useState<SortMode>("account");

  const data = (rawData ?? {}) as Record<string, unknown>;
  const beginningCash = Number(data.beginning_cash ?? 0);
  const endingCash = Number(data.ending_cash ?? 0);
  const netIncome = Number(data.net_income ?? 0);
  const netChange = Number(data.net_change ?? 0);
  const operating = (data.operating as CfSection | undefined) ?? {};
  const investing = (data.investing as CfSection | undefined) ?? {};
  const financing = (data.financing as CfSection | undefined) ?? {};

  const operatingLines = useMemo(
    () => filterAndSortLines(operating.lines ?? [], filters.debouncedSearch, sortMode),
    [operating.lines, filters.debouncedSearch, sortMode],
  );
  const investingLines = useMemo(
    () => filterAndSortLines(investing.lines ?? [], filters.debouncedSearch, sortMode),
    [investing.lines, filters.debouncedSearch, sortMode],
  );
  const financingLines = useMemo(
    () => filterAndSortLines(financing.lines ?? [], filters.debouncedSearch, sortMode),
    [financing.lines, filters.debouncedSearch, sortMode],
  );

  const operatingGroups = useMemo(() => groupByType(operatingLines), [operatingLines]);
  const investingGroups = useMemo(() => groupByType(investingLines), [investingLines]);
  const financingGroups = useMemo(() => groupByType(financingLines), [financingLines]);

  const showNetIncome =
    !filters.debouncedSearch.trim() ||
    matchesReportSearch({ account_name: "Net income" }, filters.debouncedSearch);

  const isEmpty = !loading && !rawData;

  const cashFlowColumns = [
    { key: "section", label: "Section" },
    { key: "account_type_name", label: "Type" },
    { key: "account_name", label: "Account" },
    { key: "amount", label: "Amount", format: "currency" },
  ];

  const exportSource = buildReportExportSource({
    slug: report.slug,
    title: report.title,
    columns: cashFlowColumns,
    getRows: () => {
      const rows: Record<string, unknown>[] = [
        { section: "Summary", account_name: "Beginning cash balance", amount: beginningCash },
      ];
      if (showNetIncome) {
        rows.push({ section: "Operating", account_name: "Net income", amount: netIncome });
      }
      for (const line of operatingLines) {
        rows.push({ section: "Operating", ...line });
      }
      for (const line of investingLines) {
        rows.push({ section: "Investing", ...line });
      }
      for (const line of financingLines) {
        rows.push({ section: "Financing", ...line });
      }
      rows.push(
        { section: "Summary", account_name: "Net change in cash", amount: netChange },
        { section: "Summary", account_name: "Ending cash balance", amount: endingCash },
      );
      return rows;
    },
    getSubtitle: () => reportFiltersSubtitle(filters, "range"),
  });

  return (
    <BusinessReportLayout
      report={report}
      filters={filters}
      loading={loading}
      isEmpty={isEmpty}
      onRefresh={reload}
      exportSource={exportSource}
      showDateRange
      toolbarExtra={
        <div className="flex gap-1 rounded-md border p-0.5">
          <Button
            type="button"
            size="sm"
            variant={sortMode === "account" ? "secondary" : "ghost"}
            className="h-8"
            onClick={() => setSortMode("account")}
          >
            Sort A–Z
          </Button>
          <Button
            type="button"
            size="sm"
            variant={sortMode === "amount" ? "secondary" : "ghost"}
            className="h-8"
            onClick={() => setSortMode("amount")}
          >
            Sort by amount
          </Button>
        </div>
      }
    >
      <ErrorsFeedbackBridge errors={error} />
      {loading ? (
        <AdminTableBodySkeleton rows={14} />
      ) : (
        <div className="space-y-4 p-1">
          <div className="grid gap-3 sm:grid-cols-3">
            <CashMetric label="Beginning cash" value={beginningCash} />
            <CashMetric label="Net change in cash" value={netChange} highlight />
            <CashMetric label="Ending cash" value={endingCash} />
          </div>

          <StatementTable>
            <StatementTotalRow label="Beginning cash balance" amount={beginningCash} emphasis />

            <StatementSectionHeader title="A. Cash flow from operating activities" />
            {showNetIncome ? (
              <StatementLineRow label="Net income" amount={netIncome} indent />
            ) : null}
            {operatingGroups.map(([typeName, lines]) => (
              <TypeLines key={typeName} typeName={typeName} lines={lines} />
            ))}
            <StatementTotalRow
              label="Net cash from operating activities (A)"
              amount={Number(operating.total ?? 0)}
            />

            <StatementSectionHeader title="B. Cash flow from investing activities" />
            {investingGroups.length === 0 ? (
              <StatementLineRow label="No investing activity in period" amount={0} indent />
            ) : (
              investingGroups.map(([typeName, lines]) => (
                <TypeLines key={typeName} typeName={typeName} lines={lines} />
              ))
            )}
            <StatementTotalRow
              label="Net cash from investing activities (B)"
              amount={Number(investing.total ?? 0)}
            />

            <StatementSectionHeader title="C. Cash flow from financing activities" />
            {financingGroups.length === 0 ? (
              <StatementLineRow label="No financing activity in period" amount={0} indent />
            ) : (
              financingGroups.map(([typeName, lines]) => (
                <TypeLines key={typeName} typeName={typeName} lines={lines} />
              ))
            )}
            <StatementTotalRow
              label="Net cash from financing activities (C)"
              amount={Number(financing.total ?? 0)}
            />

            <StatementTotalRow
              label="Net change in cash (A) + (B) + (C)"
              amount={netChange}
              emphasis
            />
            <StatementTotalRow label="Ending cash balance" amount={endingCash} emphasis />
          </StatementTable>
        </div>
      )}
    </BusinessReportLayout>
  );
}

function TypeLines({ typeName, lines }: { typeName: string; lines: CfLine[] }) {
  return (
    <>
      <StatementSubsectionHeader title={typeName} />
      {lines.map((row) => (
        <StatementLineRow
          key={`${row.account_code}-${row.account_name}`}
          label={row.account_name ?? row.account_code ?? "—"}
          amount={Number(row.amount ?? 0)}
          indent
        />
      ))}
    </>
  );
}

function CashMetric({
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
        className={cn(
          "mt-1 text-lg font-semibold tabular-nums",
          highlight && value < 0 && "text-destructive",
        )}
      >
        {formatCurrencyAmount(value)}
      </p>
    </div>
  );
}

function filterAndSortLines(lines: CfLine[], search: string, sortMode: SortMode) {
  const filtered = lines.filter((row) =>
    matchesReportSearch(row as Record<string, unknown>, search),
  );
  return [...filtered].sort((a, b) => {
    if (sortMode === "amount") {
      return Number(b.amount ?? 0) - Number(a.amount ?? 0);
    }
    const an = (a.account_name ?? a.account_code ?? "").toLowerCase();
    const bn = (b.account_name ?? b.account_code ?? "").toLowerCase();
    return an.localeCompare(bn);
  });
}

function groupByType(lines: CfLine[]) {
  const groups = new Map<string, CfLine[]>();
  for (const row of lines) {
    const key = row.account_type_name?.trim() || "Other";
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}
