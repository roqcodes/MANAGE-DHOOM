"use client";

import type { ReportDefinition } from "@/common/erp/report-types";
import { PaymentsReceivedSummary } from "./payments-received-summary";
import { SalesTabularReport } from "./sales/sales-tabular-report";

export function PaymentsPayablesReport({ report }: { report: ReportDefinition }) {
  if (report.slug === "payments-received") {
    return (
      <SalesTabularReport
        report={report}
        footer={(rawData) => {
          if (!rawData || typeof rawData !== "object") return null;
          const summary = (rawData as Record<string, unknown>).payment_summary;
          if (!summary || typeof summary !== "object") return null;
          return (
            <PaymentsReceivedSummary data={summary as Record<string, unknown>} />
          );
        }}
      />
    );
  }

  return <SalesTabularReport report={report} />;
}
