"use client";

import type { ReportDefinition } from "@/common/erp/report-types";
import { CustomerAgingSummaryReport } from "./customer-aging-summary-report";
import { SalesTabularReport } from "./sales/sales-tabular-report";

export function ReceivablesReport({ report }: { report: ReportDefinition }) {
  if (report.slug === "customer-aging-summary") {
    return <CustomerAgingSummaryReport report={report} />;
  }
  return <SalesTabularReport report={report} />;
}
