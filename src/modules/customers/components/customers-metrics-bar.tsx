"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

import type { CustomerStats } from "@/modules/customers/services/customers.service";
import { Button, buttonVariants } from "@/components/ui/button";
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

export function CustomersMetricsBar({
  stats,
  onExport,
  onAddCustomer,
}: {
  stats: CustomerStats;
  onExport: () => void;
  onAddCustomer?: () => void;
}) {
  const activePct =
    stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0;
  const blocked = Math.max(0, stats.total - stats.active);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Customers</h1>
          <p className="text-sm text-muted-foreground">
            Customer accounts, receivables, and billing.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onAddCustomer ? (
            <Button size="sm" onClick={onAddCustomer}>
              <Plus data-icon="inline-start" />
              Add customer
            </Button>
          ) : (
            <Link href="/admin/customers/new" className={buttonVariants({ size: "sm" })}>
              <Plus data-icon="inline-start" />
              Add customer
            </Link>
          )}
          <Button variant="outline" size="sm" onClick={onExport}>
            Export
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden border border-border py-0 ring-0">
        <div className="flex flex-col divide-y divide-border lg:flex-row lg:divide-x lg:divide-y-0">
          <MetricSegment
            label="Total customers"
            value={stats.total.toLocaleString("en-IN")}
            trend={`${stats.retail.toLocaleString("en-IN")} retail`}
            trendTone="neutral"
            sparkSeed={stats.total}
          />
          <MetricSegment
            label="Active"
            value={stats.active.toLocaleString("en-IN")}
            trend={`${activePct}% verified`}
            sparkSeed={stats.active + 2}
            sparkTone="green"
          />
          <MetricSegment
            label="Blocked"
            value={blocked.toLocaleString("en-IN")}
            trendTone="down"
            sparkSeed={blocked}
            sparkTone="neutral"
            flatSpark
          />
          <MetricSegment
            label="Staff / other"
            value={stats.staff.toLocaleString("en-IN")}
            trend="Non-retail roles"
            trendTone="neutral"
            sparkSeed={stats.staff + 5}
            sparkTone="primary"
          />
        </div>
      </Card>
    </div>
  );
}
