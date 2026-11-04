"use client";

import type { ReportDefinition } from "@/common/erp/report-types";
import { VendorAgingSummaryReport } from "./vendor-aging-summary-report";
import { SalesTabularReport } from "./sales/sales-tabular-report";

export function PayablesReport({ report }: { report: ReportDefinition }) {
  if (report.slug === "vendor-aging-summary") {
    return <VendorAgingSummaryReport report={report} />;
  }
  const footnote =
    report.slug === "vendor-aging-details"
      ? "Age (days) counts from bill date to the as-of date. Aging Summary bucket reports use days past due."
      : undefined;
  return <SalesTabularReport report={report} footnote={footnote} />;
}
