"use client";

import type { ReportDefinition } from "@/common/erp/report-types";
import { SalesTabularReport } from "./sales/sales-tabular-report";
import { PurchaseByItemReport } from "./purchases/purchase-by-item-report";
import { ExpenseReport } from "./purchases/expense-report";

export function PurchasesReport({ report }: { report: ReportDefinition }) {
  switch (report.slug) {
    case "purchase-by-item":
      return <PurchaseByItemReport report={report} />;
    case "expense-report":
      return <ExpenseReport report={report} />;
    default:
      return <SalesTabularReport report={report} />;
  }
}
