"use client";

import type { ProductCatalogStats } from "@/common/admin/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { currencyLabel } from "@/lib/format-currency";
import {
  MiniSparkline,
  TrendBadge,
} from "@/modules/orders/components/orders-ui";
import { formatProductPrice } from "@/modules/products/components/products-ui";

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

export function ProductsMetricsBar({
  stats,
  onExport,
  onImport,
  onCreate,
}: {
  stats: ProductCatalogStats;
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
          <h1 className="text-xl font-semibold tracking-tight">Inventory Items</h1>
          <p className="text-sm text-muted-foreground">
            Manage items, pricing, stock, and store inventory.
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
            New item
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden border border-border py-0 ring-0">
        <div className="flex flex-col divide-y divide-border lg:flex-row lg:divide-x lg:divide-y-0">
          <MetricSegment
            label="Total items"
            value={stats.total.toLocaleString("en-IN")}
            trend={`${stats.categoriesCount} categories`}
            trendTone="neutral"
            sparkSeed={stats.total}
          />
          <MetricSegment
            label="Active listings"
            value={stats.active.toLocaleString("en-IN")}
            trend={`${activePct}% live`}
            sparkSeed={stats.active + 2}
            sparkTone="green"
          />
          <MetricSegment
            label="Out of stock"
            value={stats.outOfStock.toLocaleString("en-IN")}
            trendTone="down"
            sparkSeed={stats.outOfStock}
            sparkTone="neutral"
            flatSpark
          />
          <MetricSegment
            label={currencyLabel("Total inventory value")}
            value={formatProductPrice(stats.inventoryValue)}
            trendTone="neutral"
            sparkSeed={Math.floor(stats.inventoryValue)}
            sparkTone="primary"
          />
        </div>
      </Card>
    </div>
  );
}
