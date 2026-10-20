"use client";

import { useMemo } from "react";

import type { ReportDefinition } from "@/common/erp/report-types";
import { extractReportRows } from "@/common/erp/report-types";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { AdminTableBodySkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { BusinessReportLayout } from "./business-report-layout";
import {
  buildReportExportSource,
  reportFiltersSubtitle,
  groupRowsByTypeName,
  matchesReportSearch,
  partitionBalanceSheetRows,
  type TrialBalanceRow,
} from "./report-format";
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

export function BalanceSheetReport({ report }: { report: ReportDefinition }) {
  const filters = useBusinessReportFilters(report);
  const { loading, error, rawData, reload } = useErpReportFetch(report, {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    asOf: filters.asOf,
    storeId: filters.storeId,
    channel: "all",
    accountId: "",
  });

  const rows = useMemo(
    () => extractReportRows(rawData, report.rowsKey) as TrialBalanceRow[],
    [rawData, report.rowsKey],
  );

  const filtered = useMemo(
    () =>
      rows.filter((row) =>
        matchesReportSearch(row as Record<string, unknown>, filters.debouncedSearch),
      ),
    [rows, filters.debouncedSearch],
  );

  const { assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity } =
    useMemo(() => partitionBalanceSheetRows(filtered), [filtered]);

  const assetGroups = useMemo(() => groupRowsByTypeName(assets), [assets]);
  const liabilityGroups = useMemo(() => groupRowsByTypeName(liabilities), [liabilities]);
  const equityGroups = useMemo(() => groupRowsByTypeName(equity), [equity]);

  const isEmpty = !loading && filtered.length === 0;

  const balanceColumns = [
    { key: "account_category", label: "Category" },
    { key: "account_type_name", label: "Type" },
    { key: "account_code", label: "Code" },
    { key: "account_name", label: "Account" },
    { key: "balance", label: "Balance", format: "currency" },
  ];

  const exportSource = buildReportExportSource({
    slug: report.slug,
    title: report.title,
    columns: balanceColumns,
    getRows: () => filtered as Record<string, unknown>[],
    getSubtitle: () => reportFiltersSubtitle(filters, "asOf"),
  });

  return (
    <BusinessReportLayout
      report={report}
      filters={filters}
      loading={loading}
      isEmpty={isEmpty}
      onRefresh={reload}
      exportSource={exportSource}
      showAsOf
      showDateRange={false}
    >
      <ErrorsFeedbackBridge errors={error} />
      {loading ? (
        <AdminTableBodySkeleton rows={14} />
      ) : (
        <div className="grid gap-8 p-1 lg:grid-cols-2">
          <div>
            <StatementTable>
              <StatementSectionHeader title="Assets" />
              {assetGroups.map(([typeName, groupRows]) => (
                <TypeGroup key={typeName} title={typeName} rows={groupRows} />
              ))}
              <StatementTotalRow label="Total assets" amount={totalAssets} emphasis />
            </StatementTable>
          </div>
          <div>
            <StatementTable>
              <StatementSectionHeader title="Liabilities & equity" />
              {liabilityGroups.map(([typeName, groupRows]) => (
                <TypeGroup key={`l-${typeName}`} title={typeName} rows={groupRows} />
              ))}
              <StatementTotalRow label="Total liabilities" amount={totalLiabilities} />
              {equityGroups.map(([typeName, groupRows]) => (
                <TypeGroup key={`e-${typeName}`} title={typeName} rows={groupRows} />
              ))}
              <StatementTotalRow
                label="Total liabilities & equity"
                amount={totalLiabilities + totalEquity}
                emphasis
              />
            </StatementTable>
          </div>
        </div>
      )}
      {!loading && !isEmpty ? (
        <p className="border-t px-4 py-2 text-xs text-muted-foreground">
          Assets {formatCurrencyAmount(totalAssets)} · Liabilities & equity{" "}
          {formatCurrencyAmount(totalLiabilities + totalEquity)}
        </p>
      ) : null}
    </BusinessReportLayout>
  );
}

function TypeGroup({ title, rows }: { title: string; rows: TrialBalanceRow[] }) {
  const subtotal = rows.reduce((s, r) => s + Number(r.balance ?? 0), 0);
  return (
    <>
      <StatementSubsectionHeader title={title} />
      {rows.map((row) => (
        <StatementLineRow
          key={`${row.account_code}-${row.account_name}`}
          label={row.account_name ?? row.account_code ?? "—"}
          amount={Number(row.balance ?? 0)}
          indent
        />
      ))}
      {rows.length > 1 ? (
        <StatementTotalRow label={`Total ${title}`} amount={subtotal} />
      ) : null}
    </>
  );
}
