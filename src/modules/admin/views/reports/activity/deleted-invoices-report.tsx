"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import type { ReportDefinition } from "@/common/erp/report-types";
import { extractReportRows } from "@/common/erp/report-types";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { TableCell } from "@/components/ui/table";
import { formatListDateLabel, formatTimeLocal } from "@/lib/format-date";

function formatActivityWhen(value: string) {
  const date = formatListDateLabel(value);
  const time = formatTimeLocal(value);
  return time ? `${date} ${time}` : date;
}
import {
  AdminDataTable,
  AdminDataTableRowsSkeleton,
  AdminListFooter,
  AdminTableBody,
  AdminTableCell,
  AdminTableHeader,
  AdminTableRow,
} from "@/modules/admin/ui";
import { Button } from "@/components/ui/button";
import { BusinessReportLayout } from "../business-overview/business-report-layout";
import { ReportKpiStrip } from "../business-overview/report-kpi-strip";
import { buildReportKpis, computeColumnAggregates } from "../business-overview/report-summaries";
import { ReportTableTotalsRow } from "../business-overview/report-table-totals-row";
import {
  buildReportExportSource,
  formatReportCell,
  reportFiltersSubtitle,
} from "../business-overview/report-format";
import { useBusinessReportFilters } from "../business-overview/use-business-report-filters";
import { useErpReportFetch } from "../business-overview/use-erp-report-fetch";

type LineItem = {
  product_name?: string;
  quantity?: number;
  unit_price?: number;
  gst_amount?: number;
  total_amount?: number;
};

export function DeletedInvoicesReport({ report }: { report: ReportDefinition }) {
  const filters = useBusinessReportFilters(report);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { loading, error, rawData, reload } = useErpReportFetch(report, {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    asOf: filters.asOf,
    storeId: filters.storeId,
    channel: "all",
    accountId: "",
    search: filters.debouncedSearch,
  });

  const rows = useMemo(
    () => extractReportRows(rawData) as Record<string, unknown>[],
    [rawData],
  );

  const aggregates = useMemo(
    () => computeColumnAggregates(report.columns, rows),
    [report.columns, rows],
  );
  const kpis = useMemo(
    () => buildReportKpis(report.columns, rows, aggregates),
    [report.columns, rows, aggregates],
  );

  const isEmpty = !loading && rows.length === 0;

  const exportSource = buildReportExportSource({
    slug: report.slug,
    title: report.title,
    columns: report.columns,
    getRows: () => rows,
    getSubtitle: () => reportFiltersSubtitle(filters, "range"),
  });

  function toggleRow(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <BusinessReportLayout
      report={report}
      filters={filters}
      loading={loading}
      isEmpty={isEmpty}
      onRefresh={reload}
      exportSource={exportSource}
      showDateRange
      searchPlaceholder="Search invoice #, customer, or user name…"
      metrics={!loading && kpis.length > 0 ? <ReportKpiStrip items={kpis} /> : null}
    >
      {error ? <p className="px-4 py-3 text-sm text-destructive">{error}</p> : null}
      {loading ? (
        <AdminDataTable>
          <AdminDataTableRowsSkeleton rows={8} columns={11} />
        </AdminDataTable>
      ) : (
        <AdminDataTable>
          <AdminTableHeader>
            <AdminTableCell className="w-8">{" "}</AdminTableCell>
            {report.columns.map((col) => (
              <AdminTableCell
                key={col.key}
                className={col.align === "right" ? "text-right text-xs font-medium" : "text-xs font-medium"}
              >
                {col.label}
              </AdminTableCell>
            ))}
          </AdminTableHeader>
          <AdminTableBody>
            {rows.map((row) => {
              const id = String(row.invoice_id ?? row.invoice_number);
              const open = expanded[id];
              const lines = (row.line_items ?? []) as LineItem[];
              return (
                <Fragment key={id}>
                  <AdminTableRow>
                    <AdminTableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => toggleRow(id)}
                        aria-expanded={open}
                      >
                        {open ? (
                          <ChevronDown className="size-4" />
                        ) : (
                          <ChevronRight className="size-4" />
                        )}
                      </Button>
                    </AdminTableCell>
                    {report.columns.map((col) => (
                      <AdminTableCell
                        key={col.key}
                        className={col.align === "right" ? "text-right tabular-nums" : undefined}
                      >
                        {col.key === "invoice_created_at" || col.key === "deleted_at"
                          ? typeof row[col.key] === "string"
                            ? formatActivityWhen(row[col.key] as string)
                            : "—"
                          : formatReportCell(row[col.key], col.format)}
                      </AdminTableCell>
                    ))}
                  </AdminTableRow>
                  {open ? (
                    <AdminTableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableCell colSpan={report.columns.length + 1} className="p-4">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                              Line items
                            </p>
                            {lines.length === 0 ? (
                              <p className="text-sm text-muted-foreground">No line items.</p>
                            ) : (
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-left text-xs text-muted-foreground">
                                    <th className="pb-1">Name</th>
                                    <th className="pb-1 text-right">Qty</th>
                                    <th className="pb-1 text-right">Price</th>
                                    <th className="pb-1 text-right">Tax</th>
                                    <th className="pb-1 text-right">Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {lines.map((line, idx) => (
                                    <tr key={idx} className="border-t border-border/50">
                                      <td className="py-1">{line.product_name ?? "—"}</td>
                                      <td className="py-1 text-right tabular-nums">{line.quantity ?? 0}</td>
                                      <td className="py-1 text-right tabular-nums">
                                        {formatCurrencyAmount(Number(line.unit_price ?? 0))}
                                      </td>
                                      <td className="py-1 text-right tabular-nums">
                                        {formatCurrencyAmount(Number(line.gst_amount ?? 0))}
                                      </td>
                                      <td className="py-1 text-right tabular-nums">
                                        {formatCurrencyAmount(Number(line.total_amount ?? 0))}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                          <div className="rounded-lg border bg-background p-3 text-sm">
                            <p className="font-medium">{String(row.store_name ?? "Store")}</p>
                            <dl className="mt-2 space-y-1 text-muted-foreground">
                              <div className="flex justify-between gap-2">
                                <dt>Tax</dt>
                                <dd className="tabular-nums text-foreground">
                                  {formatCurrencyAmount(Number(row.tax_amount ?? 0))}
                                </dd>
                              </div>
                              <div className="flex justify-between gap-2">
                                <dt>Payment mode</dt>
                                <dd className="text-foreground">{String(row.payment_mode ?? "—")}</dd>
                              </div>
                            </dl>
                          </div>
                        </div>
                      </TableCell>
                    </AdminTableRow>
                  ) : null}
                </Fragment>
              );
            })}
            <ReportTableTotalsRow
              columns={report.columns}
              rows={rows}
              leadingSpacerCells={1}
            />
          </AdminTableBody>
        </AdminDataTable>
      )}
      {!loading && rows.length > 0 ? (
        <div className="border-t px-3 py-2">
          <AdminListFooter total={rows.length} label="invoices" page={0} pageSize={rows.length} />
        </div>
      ) : null}
    </BusinessReportLayout>
  );
}
