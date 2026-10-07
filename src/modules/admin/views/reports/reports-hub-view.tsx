"use client";

import Link from "next/link";

import { ERP_REPORT_CATEGORIES, getReportsByCategory } from "@/common/erp/report-types";
import { AdminBreadcrumb } from "@/modules/admin/components/admin-breadcrumb";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ReportsHubView() {
  const byCategory = getReportsByCategory();

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <AdminBreadcrumb items={[{ label: "Reports" }]} backHref="/admin" />

      <div>
        <h1 className="text-xl font-semibold tracking-tight">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Financial, sales, inventory, and receivables reports. Filter by store and channel
          (ERP store vs online) where applicable.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ERP_REPORT_CATEGORIES.map((category) => {
          const reports = byCategory[category] ?? [];
          if (reports.length === 0) return null;
          return (
            <Card key={category}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">{category}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {reports.map((report) => (
                  <Link
                    key={report.slug}
                    href={`/admin/erp/reports/${report.slug}`}
                    className="block rounded-md px-2 py-1.5 text-sm text-primary hover:bg-muted hover:underline"
                  >
                    {report.title}
                  </Link>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
