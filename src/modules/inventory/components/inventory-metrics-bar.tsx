"use client";

import type { InventoryCatalogStats } from "@/common/admin/types";
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

export function InventoryMetricsBar({
  stats,
}: {
  stats: InventoryCatalogStats;
  storeLabel?: string;
  onExport?: () => void;
}) {
  const healthyPct =
    stats.totalSkus > 0
      ? Math.round((stats.healthySkus / stats.totalSkus) * 100)
      : 0;

  return (
    <Card className="overflow-hidden border border-border py-0 ring-0">
      <div className="flex flex-col lg:flex-row lg:divide-x lg:divide-border">
        <MetricSegment
          label="Tracked SKUs"
          value={stats.totalSkus.toLocaleString("en-IN")}
          trend={`${healthyPct}% healthy`}
          trendTone="neutral"
          sparkSeed={stats.totalSkus}
        />
        <MetricSegment
          label="Healthy (≥10)"
          value={stats.healthySkus.toLocaleString("en-IN")}
          trend={healthyPct > 0 ? `${healthyPct}%` : "0%"}
          sparkSeed={stats.healthySkus + 3}
          sparkTone="green"
        />
        <MetricSegment
          label="Low (1–9)"
          value={stats.lowStockSkus.toLocaleString("en-IN")}
          trend={stats.lowStockSkus > 0 ? "Needs attention" : "None flagged"}
          trendTone="neutral"
          sparkSeed={stats.lowStockSkus + 7}
          sparkTone="neutral"
        />
        <MetricSegment
          label="Critical"
          value={stats.criticalSkus.toLocaleString("en-IN")}
          trend={stats.criticalSkus > 0 ? "Out of stock" : "None flagged"}
          trendTone={stats.criticalSkus > 0 ? "down" : "neutral"}
          sparkSeed={stats.criticalSkus + 11}
          sparkTone="neutral"
          flatSpark={stats.criticalSkus === 0}
        />
      </div>
    </Card>
  );
}
