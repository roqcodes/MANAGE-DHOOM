"use client";

import type { VendorCatalogStats } from "@/common/admin/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  MiniSparkline,
  TrendBadge,
} from "@/modules/orders/components/orders-ui";

function MetricSegment({
  label,
  value,
  trend,
  trendTone = "up",
  sparkSeed,
  sparkTone = "primary",
  flatSpark = false,
}: {
  label: string;
  value: string;
  trend?: string;
  trendTone?: "up" | "down" | "neutral";
  sparkSeed: number;
  sparkTone?: "primary" | "neutral" | "green";
  flatSpark?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <p className="text-xl font-semibold tabular-nums tracking-tight">
            {value}
          </p>
          {trend ? <TrendBadge value={trend} tone={trendTone} /> : null}
        </div>
      </div>
      <MiniSparkline seed={sparkSeed} tone={sparkTone} flat={flatSpark} />
    </div>
  );
}

export function VendorsMetricsBar({
  stats,
  onExport,
  onImport,
  onCreate,
}: {
  stats: VendorCatalogStats;
  onExport: () => void;
  onImport: () => void;
  onCreate: () => void;
}) {
  const activePct =
    stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Vendors</h1>
          <p className="text-sm text-muted-foreground">
            Manage partners, contacts, and supply lines.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onExport}>
            Export
          </Button>
          <Button variant="outline" size="sm" onClick={onImport}>
            Import
          </Button>
          <Button size="sm" onClick={onCreate}>
            New vendor
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden border border-border py-0 ring-0">
        <div className="flex flex-col divide-y divide-border lg:flex-row lg:divide-x lg:divide-y-0">
          <MetricSegment
            label="Total vendors"
            value={stats.total.toLocaleString("en-IN")}
            trend={`${stats.supplyLines.toLocaleString("en-IN")} supply lines`}
            trendTone="neutral"
            sparkSeed={stats.total}
          />
          <MetricSegment
            label="Active"
            value={stats.active.toLocaleString("en-IN")}
            trend={`${activePct}% live`}
            sparkSeed={stats.active + 2}
            sparkTone="green"
          />
          <MetricSegment
            label="Inactive"
            value={stats.inactive.toLocaleString("en-IN")}
            trendTone="neutral"
            sparkSeed={stats.inactive}
            sparkTone="neutral"
            flatSpark
          />
          <MetricSegment
            label="Supply lines"
            value={stats.supplyLines.toLocaleString("en-IN")}
            trend="Variant offers"
            trendTone="neutral"
            sparkSeed={stats.supplyLines + 5}
            sparkTone="primary"
          />
        </div>
      </Card>
    </div>
  );
}
