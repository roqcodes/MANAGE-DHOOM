"use client";

import type { ReportDefinition } from "@/common/erp/report-types";
import { CustomerAgingSummaryReport } from "./customer-aging-summary-report";
import { SalesTabularReport } from "./sales/sales-tabular-report";

export function ReceivablesReport({ report }: { report: ReportDefinition }) {
  if (report.slug === "customer-aging-summary") {
    return <CustomerAgingSummaryReport report={report} />;
  }
  const footnote =
    report.slug === "customer-aging-details"
      ? "Age (days) counts from invoice date to the as-of date. Aging Summary bucket reports use days past due."
      : undefined;
  return <SalesTabularReport report={report} footnote={footnote} />;
}
