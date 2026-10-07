"use client";

import type { ReactNode } from "react";
import { RefreshCcw, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  MiniSparkline,
  TrendBadge,
} from "@/modules/orders/components/orders-ui";
import { currencyLabel } from "@/lib/format-currency";
import { formatBillingInr } from "@/modules/billing/components/billing-ui";

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
  value: ReactNode;
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

export function BillingMetricsBar({
  itemCount,
  lineCount,
  subtotal,
  totalDiscount,
  grandTotal,
  onClear,
  onSave,
  canSave,
  isSubmitting,
}: {
  itemCount: number;
  lineCount: number;
  subtotal: number;
  totalDiscount: number;
  grandTotal: number;
  onClear: () => void;
  onSave: () => void;
  canSave: boolean;
  isSubmitting: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">POS Billing</h1>
          <p className="text-sm text-muted-foreground">
            Record in-store sales as online orders with immediate fulfillment.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onClear} disabled={isSubmitting}>
            <RefreshCcw data-icon="inline-start" />
            Clear bill
          </Button>
          <Button size="sm" onClick={onSave} disabled={!canSave || isSubmitting}>
            <Save data-icon="inline-start" />
            {isSubmitting ? "Saving…" : "Complete sale"}
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden border border-border py-0 ring-0">
        <div className="flex flex-col divide-y divide-border lg:flex-row lg:divide-x lg:divide-y-0">
          <MetricSegment
            label="Line items"
            value={lineCount.toLocaleString("en-IN")}
            trend={`${itemCount} units`}
            trendTone="neutral"
            sparkSeed={lineCount}
          />
          <MetricSegment
            label={currencyLabel("Subtotal")}
            value={formatBillingInr(subtotal)}
            trendTone="neutral"
            sparkSeed={Math.floor(subtotal)}
            sparkTone="primary"
          />
          <MetricSegment
            label={currencyLabel("Discount")}
            value={formatBillingInr(totalDiscount)}
            trendTone={totalDiscount > 0 ? "down" : "neutral"}
            sparkSeed={Math.floor(totalDiscount)}
            sparkTone="neutral"
            flatSpark
          />
          <MetricSegment
            label={currencyLabel("Grand total")}
            value={formatBillingInr(grandTotal)}
            trend="Tax excluded"
            trendTone="neutral"
            sparkSeed={Math.floor(grandTotal)}
            sparkTone="green"
          />
        </div>
      </Card>
    </div>
  );
}
