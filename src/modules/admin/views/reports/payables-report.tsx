"use client";

import type { ReportDefinition } from "@/common/erp/report-types";
import { VendorAgingSummaryReport } from "./vendor-aging-summary-report";
import { SalesTabularReport } from "./sales/sales-tabular-report";

export function PayablesReport({ report }: { report: ReportDefinition }) {
  if (report.slug === "vendor-aging-summary") {
    return <VendorAgingSummaryReport report={report} />;
  }
  return <SalesTabularReport report={report} />;
}
