"use client";

import type { ReportDefinition } from "@/common/erp/report-types";
import { SalesTabularReport } from "./sales/sales-tabular-report";

const COLLECTION_SLUGS = new Set(["daily-collection-report", "monthly-collection-report"]);

export function SalesReport({ report }: { report: ReportDefinition }) {
  const showTotals = COLLECTION_SLUGS.has(report.slug) || report.slug === "sales-by-salesman";
  const footnote =
    report.slug === "sales-by-customer"
      ? "Purchase cost uses allocated line cost (base price × qty). No-stock sales may not include vendor cost."
      : undefined;

  return <SalesTabularReport report={report} showTotals={showTotals} footnote={footnote} />;
}
