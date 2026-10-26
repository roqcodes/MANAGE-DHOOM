"use client";

import type { ReportDefinition } from "@/common/erp/report-types";
import { SalesTabularReport } from "./sales/sales-tabular-report";

export function SalesReport({ report }: { report: ReportDefinition }) {
  const profitReportSlugs = new Set([
    "sales-by-customer",
    "sales-by-item",
    "sales-by-salesman",
  ]);
  const footnote = profitReportSlugs.has(report.slug)
    ? "Net sales (ex tax) and recognized profit use line revenue after prorated invoice header discount. Sales (incl. tax) on Sales by Item sums line totals (tax may reflect pre-discount line bases); Sales by Customer uses invoice totals minus credit notes. Recognized profit excludes pending-cost lines until receipt. P&L uses posted journals and may differ from sale COGS here."
    : undefined;

  return <SalesTabularReport report={report} footnote={footnote} />;
}
