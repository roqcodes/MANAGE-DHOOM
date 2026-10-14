"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { ERP_REPORT_CATEGORIES, getReportsByCategory } from "@/common/erp/report-types";
import { AdminPageHeader, AdminPageLayout } from "@/modules/admin/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const CATEGORY_HINTS: Partial<Record<string, string>> = {
  "Business Overview":
    "P&L, balance sheet, cash flow, finance snapshot, and day book — with date range, store, and search.",
  Sales:
    "Collections, customer and item sales, credit notes, and salesman performance — filter by store, channel, and date.",
  Inventory:
    "Stock levels, valuations, store summaries, and transfer requests — filter by store, brand, category, and status.",
  "Purchases and Expenses":
    "Purchase by item (bills plus inbound transfers) and purchase by vendor (expenses, bills, credits) — by store and date.",
  Receivables:
    "Customer balance, aging summary (counts and amounts), and invoice-level aging details — by store and due date.",
  "Payments Received":
    "Customer collections in a date range — invoice, store, mode, bank charges, and payment-mode totals.",
  Payables:
    "Vendor balance (opening, bills, credits, payments) and bill aging by due-date buckets.",
  Taxes:
    "VAT return summary by store and transaction-level output/input lines with net VAT due.",
  Accountant:
    "Trial balance, general ledger, and account transaction detail — filter by store, account, and date.",
  Activity:
    "Audit trail by entity and user; cancelled invoices with line detail and staff names (not IDs).",
};

export function ReportsHubView() {
  const byCategory = getReportsByCategory();

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title="Reports"
        backHref="/admin"
        breadcrumb={[{ label: "Reports" }]}
        description="Financial, sales, inventory, and receivables. Open a report to filter by store, date range, and search line items."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ERP_REPORT_CATEGORIES.map((category) => {
          const reports = byCategory[category] ?? [];
          if (reports.length === 0) return null;
          const isFeatured =
            category === "Business Overview" ||
            category === "Sales" ||
            category === "Inventory" ||
            category === "Receivables" ||
            category === "Payments Received" ||
            category === "Payables" ||
            category === "Purchases and Expenses" ||
            category === "Taxes" ||
            category === "Accountant" ||
            category === "Activity";
          return (
            <Card
              key={category}
              className={cn(isFeatured && "border-primary/20 shadow-sm md:col-span-2 xl:col-span-1")}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">{category}</CardTitle>
                {CATEGORY_HINTS[category] ? (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {CATEGORY_HINTS[category]}
                  </p>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-1">
                {reports.map((report) => (
                  <Link
                    key={report.slug}
                    href={`/admin/erp/reports/${report.slug}`}
                    className="group flex items-start justify-between gap-2 rounded-lg border border-transparent px-2.5 py-2 transition-colors hover:border-border hover:bg-muted/50"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground group-hover:text-primary">
                        {report.title}
                      </span>
                      <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {report.description}
                      </span>
                    </span>
                    <ChevronRight
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                      aria-hidden
                    />
                  </Link>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </AdminPageLayout>
  );
}
