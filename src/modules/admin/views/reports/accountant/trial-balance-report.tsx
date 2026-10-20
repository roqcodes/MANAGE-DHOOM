"use client";

import { Fragment, useMemo } from "react";

import type { ReportDefinition } from "@/common/erp/report-types";
import { extractReportRows } from "@/common/erp/report-types";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { AdminTableBodySkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { BusinessReportLayout } from "../business-overview/business-report-layout";
import { ReportKpiStrip } from "../business-overview/report-kpi-strip";
import {
  buildReportExportSource,
  reportFiltersSubtitle,
  matchesReportSearch,
  partitionTrialBalanceSections,
  type TrialBalanceRow,
} from "../business-overview/report-format";
import { useBusinessReportFilters } from "../business-overview/use-business-report-filters";
import { useErpReportFetch } from "../business-overview/use-erp-report-fetch";
import { ErrorsFeedbackBridge } from "@/modules/feedback/components/errors-feedback-bridge";

export function TrialBalanceReport({ report }: { report: ReportDefinition }) {
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

  const sections = useMemo(() => partitionTrialBalanceSections(filtered), [filtered]);

  const totals = useMemo(() => {
    const meta = rawData as Record<string, unknown> | null;
    if (meta && typeof meta.total_debit === "number" && typeof meta.total_credit === "number") {
      return { debit: meta.total_debit, credit: meta.total_credit };
    }
    const debit = rows.reduce((acc, r) => acc + Number(r.period_debit ?? 0), 0);
    const credit = rows.reduce((acc, r) => acc + Number(r.period_credit ?? 0), 0);
    return { debit, credit };
  }, [rawData, rows]);

  const kpiItems = useMemo(
    () =>
      filtered.length === 0
        ? []
        : [
            { label: "Accounts", value: filtered.length.toLocaleString() },
            { label: "Net debit", value: formatCurrencyAmount(totals.debit) },
            { label: "Net credit", value: formatCurrencyAmount(totals.credit) },
          ],
    [filtered.length, totals],
  );

  const isEmpty = !loading && filtered.length === 0;

  const trialColumns = [
    { key: "account_category", label: "Category" },
    { key: "account_name", label: "Account" },
    { key: "period_debit", label: "Net debit", format: "currency" },
    { key: "period_credit", label: "Net credit", format: "currency" },
  ];

  const exportSource = buildReportExportSource({
    slug: report.slug,
    title: report.title,
    columns: trialColumns,
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
      searchPlaceholder="Search account…"
      metrics={
        !loading && filtered.length > 0 ? <ReportKpiStrip items={kpiItems} /> : null
      }
    >
      <ErrorsFeedbackBridge errors={error} />
      {loading ? (
        <AdminTableBodySkeleton rows={16} />
      ) : (
        <div className="overflow-x-auto p-2">
          <table className="w-full min-w-[480px] border-collapse text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">Account</th>
                <th className="px-4 py-3 text-right font-medium">Net debit</th>
                <th className="px-4 py-3 text-right font-medium">Net credit</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((section) => (
                <Fragment key={section.title}>
                  <tr className="border-b bg-muted/30">
                    <td
                      colSpan={3}
                      className="px-4 py-2 text-sm font-semibold text-primary"
                    >
                      {section.title}
                    </td>
                  </tr>
                  {section.rows.map((row) => (
                    <tr
                      key={`${row.account_code}-${row.account_name}`}
                      className="border-b border-border/50 hover:bg-muted/20"
                    >
                      <td className="px-4 py-2 pl-6">{row.account_name}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {formatCurrencyAmount(Number(row.period_debit ?? 0))}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {formatCurrencyAmount(Number(row.period_credit ?? 0))}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
              {filtered.length > 0 ? (
                <tr className="border-y bg-muted/50 font-semibold">
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCurrencyAmount(totals.debit)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCurrencyAmount(totals.credit)}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </BusinessReportLayout>
  );
}
