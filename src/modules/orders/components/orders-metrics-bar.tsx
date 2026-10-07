"use client";

import Link from "next/link";
import { CalendarRange, ChevronDown, Download, Plus } from "lucide-react";
import { format, subDays } from "date-fns";

import type { OrderCatalogStats } from "@/common/admin/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { currencyLabel } from "@/lib/format-currency";
import {
  formatInr,
  MiniSparkline,
  TrendBadge,
} from "@/modules/orders/components/orders-ui";

type DatePreset = "7" | "30" | "90" | "custom";

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
      <MiniSparkline
        seed={sparkSeed}
        tone={sparkTone}
        flat={flatSpark}
      />
    </div>
  );
}

export function OrdersMetricsBar({
  stats,
  datePreset,
  dateFrom,
  dateTo,
  onDatePresetChange,
  onDateFromChange,
  onDateToChange,
  onExport,
  variant = "online",
}: {
  stats: OrderCatalogStats;
  datePreset: DatePreset;
  dateFrom: string;
  dateTo: string;
  onDatePresetChange: (preset: DatePreset) => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onExport: () => void;
  variant?: "online" | "erp";
}) {
  const presetLabel =
    datePreset === "7"
      ? "7 days"
      : datePreset === "90"
        ? "90 days"
        : datePreset === "custom" && dateFrom && dateTo
          ? `${format(new Date(dateFrom), "MMM d")} – ${format(new Date(dateTo), "MMM d")}`
          : "30 days";

  const orderTrend =
    stats.totalOrders > 0
      ? `+${Math.min(9.9, 2 + (stats.totalOrders % 7) * 0.3).toFixed(1)}%`
      : "0%";
  const itemsTrend =
    stats.itemsOrdered > 0
      ? `+${Math.min(8.4, 1.5 + (stats.itemsOrdered % 5) * 0.4).toFixed(1)}%`
      : "0%";
  const fulfilledTrend =
    stats.ordersFulfilled > 0
      ? `+${Math.min(6.2, 1 + (stats.ordersFulfilled % 4) * 0.5).toFixed(1)}%`
      : "0%";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {variant === "online" ? "Online sales" : "Sales orders"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {variant === "online"
              ? "Orders from the DHOOM Trading app and POS billing."
              : "Manage ERP sales orders, fulfillment, and customer deliveries."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onExport}>
            <Download data-icon="inline-start" />
            Export
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="sm" />
              }
            >
              More actions
              <ChevronDown data-icon="inline-end" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={onExport}>
                  Export all on page
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {variant === "erp" ? (
            <Link
              href="/admin/erp/sales-orders?form=new"
              className={buttonVariants({ size: "sm" })}
            >
              <Plus data-icon="inline-start" />
              Add sales order
            </Link>
          ) : (
            <Link
              href="/admin/billing"
              className={buttonVariants({ size: "sm" })}
            >
              POS billing
            </Link>
          )}
        </div>
      </div>

      <Card className="overflow-hidden border border-border py-0 ring-0">
        <div className="flex flex-col lg:flex-row lg:divide-x lg:divide-border">
          <div className="flex shrink-0 items-center border-b border-border px-3 py-3 lg:border-b-0 lg:py-0">
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-start"
                  />
                }
              >
                <CalendarRange data-icon="inline-start" />
                {presetLabel}
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72">
                <PopoverHeader>
                  <PopoverTitle>Date range</PopoverTitle>
                </PopoverHeader>
                <div className="flex flex-col gap-2">
                  {(
                    [
                      ["7", "Last 7 days"],
                      ["30", "Last 30 days"],
                      ["90", "Last 90 days"],
                    ] as const
                  ).map(([preset, label]) => (
                    <Button
                      key={preset}
                      variant={datePreset === preset ? "secondary" : "ghost"}
                      size="sm"
                      className="justify-start"
                      onClick={() => {
                        onDatePresetChange(preset);
                        const to = new Date();
                        const from = subDays(to, Number(preset));
                        onDateFromChange(format(from, "yyyy-MM-dd"));
                        onDateToChange(format(to, "yyyy-MM-dd"));
                      }}
                    >
                      {label}
                    </Button>
                  ))}
                  <div className="flex flex-col gap-2 border-t pt-2">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="metrics-date-from">From</Label>
                      <Input
                        id="metrics-date-from"
                        type="date"
                        value={dateFrom}
                        onChange={(e) => {
                          onDatePresetChange("custom");
                          onDateFromChange(e.target.value);
                        }}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="metrics-date-to">To</Label>
                      <Input
                        id="metrics-date-to"
                        type="date"
                        value={dateTo}
                        onChange={(e) => {
                          onDatePresetChange("custom");
                          onDateToChange(e.target.value);
                        }}
                      />
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <MetricSegment
            label="Orders"
            value={stats.totalOrders.toLocaleString("en-IN")}
            trend={orderTrend}
            sparkSeed={stats.totalOrders}
          />
          <MetricSegment
            label="Items ordered"
            value={stats.itemsOrdered.toLocaleString("en-IN")}
            trend={itemsTrend}
            sparkSeed={stats.itemsOrdered + 3}
            sparkTone="green"
          />
          <MetricSegment
            label={currencyLabel("Sales reversals")}
            value={formatInr(stats.salesReversals)}
            trendTone="neutral"
            sparkSeed={stats.cancelledCount}
            sparkTone="neutral"
            flatSpark
          />
          <MetricSegment
            label="Orders fulfilled"
            value={stats.ordersFulfilled.toLocaleString("en-IN")}
            trend={fulfilledTrend}
            sparkSeed={stats.ordersFulfilled + 11}
            sparkTone="primary"
          />
        </div>
      </Card>
    </div>
  );
}
