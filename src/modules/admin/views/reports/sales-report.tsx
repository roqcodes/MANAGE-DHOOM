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
    ? "Revenue includes all sales. Recognized profit excludes lines with pending inventory cost until a purchase receipt supplies unit cost (FIFO by invoice date). P&L net profit is from posted journals and does not include sale COGS."
    : undefined;

  return <SalesTabularReport report={report} footnote={footnote} />;
}
