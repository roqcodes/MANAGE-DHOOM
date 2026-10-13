"use client";

import type { TeamCatalogStats } from "@/modules/users/services/users.service";
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
  valuesLoading = false,
}: {
  label: string;
  value: string;
  trend?: string;
  trendTone?: "up" | "down" | "neutral";
  sparkSeed: number;
  sparkTone?: "primary" | "neutral" | "green";
  flatSpark?: boolean;
  valuesLoading?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {valuesLoading ? (
            <span className="inline-block h-7 w-20 animate-pulse rounded-md bg-muted" />
          ) : (
            <p className="text-xl font-semibold tabular-nums tracking-tight">
              {value}
            </p>
          )}
          {!valuesLoading && trend ? (
            <TrendBadge value={trend} tone={trendTone} />
          ) : null}
        </div>
      </div>
      {valuesLoading ? (
        <span className="inline-block h-8 w-16 shrink-0 animate-pulse rounded-md bg-muted/80" />
      ) : (
        <MiniSparkline seed={sparkSeed} tone={sparkTone} flat={flatSpark} />
      )}
    </div>
  );
}

export function UsersMetricsBar({
  stats,
  onExport,
  valuesLoading = false,
}: {
  stats: TeamCatalogStats;
  onExport: () => void;
  valuesLoading?: boolean;
}) {
  const portalStaff =
    stats.vendor + stats.delivery + (stats.erpStaff ?? stats.admin + stats.manager);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Team & Users</h1>
          <p className="text-sm text-muted-foreground">
            Portal staff and access requests. Storefront customers live under
            Customers.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onExport}>
            Export
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden border border-border py-0 ring-0">
        <div className="flex flex-col divide-y divide-border lg:flex-row lg:divide-x lg:divide-y-0">
          <MetricSegment
            label="Portal staff"
            value={portalStaff.toLocaleString("en-IN")}
            trend={`${stats.erpStaff ?? 0} ERP · ${stats.vendor} vendors · ${stats.delivery} delivery`}
            trendTone="neutral"
            sparkSeed={portalStaff + 3}
            sparkTone="green"
            valuesLoading={valuesLoading}
          />
          <MetricSegment
            label="Admins & managers"
            value={(stats.admin + stats.manager).toLocaleString("en-IN")}
            trend={`${stats.admin} admins · ${stats.manager} managers`}
            trendTone="neutral"
            sparkSeed={stats.admin + stats.manager + 1}
            sparkTone="primary"
            valuesLoading={valuesLoading}
          />
          <MetricSegment
            label="Pending requests"
            value={stats.pendingRequests.toLocaleString("en-IN")}
            trendTone={stats.pendingRequests > 0 ? "down" : "neutral"}
            sparkSeed={stats.pendingRequests}
            sparkTone="neutral"
            flatSpark
            valuesLoading={valuesLoading}
          />
        </div>
      </Card>
    </div>
  );
}
