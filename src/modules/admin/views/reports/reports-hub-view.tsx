"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { ERP_REPORT_CATEGORIES, getReportsByCategory } from "@/common/erp/report-types";
import { AdminPageHeader, AdminPageLayout } from "@/modules/admin/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ReportFavoriteButton } from "./report-favorite-button";
import { ReportFavoritesBar } from "./report-favorites-bar";

export function ReportsHubView() {
  const byCategory = getReportsByCategory();

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title="Reports"
        backHref="/admin"
        breadcrumb={[{ label: "Reports" }]}
      />

      <ReportFavoritesBar />

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
              </CardHeader>
              <CardContent className="space-y-1">
                {reports.map((report) => (
                  <div
                    key={report.slug}
                    className="group flex items-start gap-1 rounded-lg border border-transparent px-1.5 py-1 transition-colors hover:border-border hover:bg-muted/50"
                  >
                    <Link
                      href={`/admin/erp/reports/${report.slug}`}
                      className="flex min-w-0 flex-1 items-start justify-between gap-2 px-1 py-1"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-foreground group-hover:text-primary">
                          {report.title}
                        </span>
                      </span>
                      <ChevronRight
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                        aria-hidden
                      />
                    </Link>
                    <ReportFavoriteButton slug={report.slug} className="mt-0.5 shrink-0" />
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </AdminPageLayout>
  );
}
