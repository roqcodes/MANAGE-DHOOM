"use client";

import type { ReportDefinition } from "@/common/erp/report-types";
import { AccountTransactionsReport } from "./accountant/account-transactions-report";
import { GeneralLedgerReport } from "./accountant/general-ledger-report";
import { TrialBalanceReport } from "./accountant/trial-balance-report";
import { SalesTabularReport } from "./sales/sales-tabular-report";

export function AccountantReport({ report }: { report: ReportDefinition }) {
  switch (report.slug) {
    case "trial-balance":
      return <TrialBalanceReport report={report} />;
    case "general-ledger":
      return <GeneralLedgerReport report={report} />;
    case "account-transactions":
      return <AccountTransactionsReport report={report} />;
    default:
      return <SalesTabularReport report={report} />;
  }
}
