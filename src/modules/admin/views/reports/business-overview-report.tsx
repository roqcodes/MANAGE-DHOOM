"use client";

import type { ReportDefinition } from "@/common/erp/report-types";
import { BalanceSheetReport } from "./business-overview/balance-sheet-report";
import { CashFlowReport } from "./business-overview/cash-flow-report";
import { DayBookReport } from "./business-overview/day-book-report";
import { FinanceSummaryReport } from "./business-overview/finance-summary-report";
import { ProfitAndLossReport } from "./business-overview/profit-and-loss-report";

export function BusinessOverviewReport({ report }: { report: ReportDefinition }) {
  switch (report.slug) {
    case "profit-and-loss":
      return <ProfitAndLossReport report={report} />;
    case "balance-sheet":
      return <BalanceSheetReport report={report} />;
    case "finance-summary":
      return <FinanceSummaryReport report={report} />;
    case "day-book":
      return <DayBookReport report={report} />;
    case "cash-flow-statement":
      return <CashFlowReport report={report} />;
    default:
      return null;
  }
}
