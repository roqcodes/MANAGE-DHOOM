"use client";

import { Download, Plus } from "lucide-react";

import type { RecurringScheduleRow } from "@/common/erp/types";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  MiniSparkline,
  TrendBadge,
} from "@/modules/orders/components/orders-ui";

export type RecurringScheduleStats = {
  total: number;
  active: number;
  paused: number;
  dueSoon: number;
  monthlyValue: number;
  invoiceCount: number;
  billCount: number;
};

export function computeRecurringScheduleStats(
  rows: RecurringScheduleRow[],
): RecurringScheduleStats {
  const today = new Date();
  const weekAhead = new Date(today);
  weekAhead.setDate(weekAhead.getDate() + 7);

  let monthlyValue = 0;
  let invoiceCount = 0;
  let billCount = 0;
  let dueSoon = 0;

  for (const row of rows) {
    if (row.schedule_type === "invoice") invoiceCount++;
    else billCount++;

    const lines =
      (row.payload?.lines as Array<{ unitPrice?: number; quantity?: number }>) ?? [];
    const amount = lines.reduce(
      (sum, line) => sum + Number(line.unitPrice ?? 0) * Number(line.quantity ?? 1),
      0,
    );
    if (row.is_active) monthlyValue += amount;

    if (row.is_active && row.next_run_date) {
      const next = new Date(row.next_run_date);
      if (next >= today && next <= weekAhead) dueSoon++;
    }
  }

  return {
    total: rows.length,
    active: rows.filter((r) => r.is_active).length,
    paused: rows.filter((r) => !r.is_active).length,
    dueSoon,
    monthlyValue,
    invoiceCount,
    billCount,
  };
}

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
          <p className="text-xl font-semibold tabular-nums tracking-tight">{value}</p>
          {trend ? <TrendBadge value={trend} tone={trendTone} /> : null}
        </div>
      </div>
      <MiniSparkline seed={sparkSeed} tone={sparkTone} flat={flatSpark} />
    </div>
  );
}

export function RecurringSchedulesMetricsBar({
  variant = "purchase_bill",
  title,
  description,
  createButtonLabel = "New schedule",
  stats,
  onExport,
  onCreate,
}: {
  variant?: "invoice" | "purchase_bill";
  title?: string;
  description?: string;
  createButtonLabel?: string;
  stats: RecurringScheduleStats;
  onExport: () => void;
  onCreate: () => void;
}) {
  const activePct = stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0;
  const resolvedTitle =
    title ?? (variant === "invoice" ? "Recurring invoices" : "Recurring bills");
  const resolvedDescription =
    description ??
    (variant === "invoice"
      ? "Automate repeating customer invoices — money to be received on schedule."
      : "Automate repeating vendor purchase bills — money to be paid on schedule.");
  const valueTrend =
    variant === "invoice"
      ? `${stats.invoiceCount} invoice${stats.invoiceCount === 1 ? "" : "s"}`
      : `${stats.billCount} bill${stats.billCount === 1 ? "" : "s"}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{resolvedTitle}</h1>
          <p className="text-sm text-muted-foreground">{resolvedDescription}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onExport}>
            <Download data-icon="inline-start" />
            Export
          </Button>
          <Button size="sm" onClick={onCreate}>
            <Plus data-icon="inline-start" />
            {createButtonLabel}
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden border border-border py-0 ring-0">
        <div className="flex flex-col divide-y divide-border lg:flex-row lg:divide-x lg:divide-y-0">
          <MetricSegment
            label="Total schedules"
            value={String(stats.total)}
            trend={stats.total > 0 ? `${activePct}% active` : undefined}
            trendTone="neutral"
            sparkSeed={stats.total}
          />
          <MetricSegment
            label="Due within 7 days"
            value={String(stats.dueSoon)}
            trend={stats.dueSoon > 0 ? "Action needed" : "On track"}
            trendTone={stats.dueSoon > 0 ? "down" : "up"}
            sparkSeed={stats.dueSoon + 3}
            sparkTone={stats.dueSoon > 0 ? "neutral" : "green"}
          />
          <MetricSegment
            label="Active recurring value"
            value={formatCurrencyAmount(stats.monthlyValue)}
            trend={valueTrend}
            trendTone="neutral"
            sparkSeed={Math.round(stats.monthlyValue) % 97}
            flatSpark={stats.monthlyValue === 0}
          />
          <MetricSegment
            label="Paused"
            value={String(stats.paused)}
            trend={stats.paused > 0 ? "Review paused" : "All running"}
            trendTone={stats.paused > 0 ? "neutral" : "up"}
            sparkSeed={stats.paused + 11}
            sparkTone="neutral"
            flatSpark={stats.paused === 0}
          />
        </div>
      </Card>
    </div>
  );
}
