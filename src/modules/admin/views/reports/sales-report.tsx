"use client";

import type { ReportDefinition } from "@/common/erp/report-types";
import { SalesTabularReport } from "./sales/sales-tabular-report";

export function SalesReport({ report }: { report: ReportDefinition }) {
  const footnote =
    report.slug === "sales-by-customer"
      ? "Purchase cost uses allocated line cost (base price × qty). No-stock sales may not include vendor cost."
      : undefined;

  return <SalesTabularReport report={report} footnote={footnote} />;
}
