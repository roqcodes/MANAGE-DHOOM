"use client";

import type { ReportDefinition } from "@/common/erp/report-types";
import { SalesTabularReport } from "./sales/sales-tabular-report";

const TOTALS_SLUGS = new Set([
  "customer-balance",
  "customer-aging",
  "customer-aging-summary",
  "customer-aging-details",
]);

export function ReceivablesReport({ report }: { report: ReportDefinition }) {
  return <SalesTabularReport report={report} showTotals={TOTALS_SLUGS.has(report.slug)} />;
}
