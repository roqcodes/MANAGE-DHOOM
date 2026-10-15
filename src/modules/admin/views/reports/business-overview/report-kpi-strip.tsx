"use client";

import { Card } from "@/components/ui/card";
import { CatalogMetricSegment } from "@/modules/orders/components/orders-ui";
import type { ReportKpiItem } from "./report-summaries";

export function ReportKpiStrip({
  items,
  valuesLoading = false,
}: {
  items: ReportKpiItem[];
  valuesLoading?: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <Card className="overflow-hidden border border-border py-0 ring-0">
      <div className="flex flex-col lg:flex-row lg:divide-x lg:divide-border">
        {items.map((item) => (
          <CatalogMetricSegment
            key={item.label}
            label={item.label}
            value={item.value}
            hideSparkline
            valuesLoading={valuesLoading}
          />
        ))}
      </div>
    </Card>
  );
}
