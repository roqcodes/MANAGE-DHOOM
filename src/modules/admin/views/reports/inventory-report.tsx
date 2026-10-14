"use client";

import type { ReportDefinition } from "@/common/erp/report-types";
import { SalesTabularReport } from "./sales/sales-tabular-report";
import { StockReport } from "./inventory/stock-report";
import { StockTransferReport } from "./inventory/stock-transfer-report";

export function InventoryReport({ report }: { report: ReportDefinition }) {
  switch (report.slug) {
    case "item-stock":
      return <StockReport report={report} />;
    case "stock-transfer-report":
      return <StockTransferReport report={report} />;
    case "store-wise-stock":
      return <SalesTabularReport report={report} showTotals />;
    default:
      return <SalesTabularReport report={report} />;
  }
}
