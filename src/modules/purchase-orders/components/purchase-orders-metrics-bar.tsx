"use client";

import Link from "next/link";
import { ChevronDown, Download } from "lucide-react";

import type { PurchaseOrderCatalogStats } from "@/common/admin/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PurchaseOrderDeliveryFilter } from "@/common/admin/types";
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
  onClick,
  active = false,
}: {
  label: string;
  value: string;
  trend?: string;
  trendTone?: "up" | "down" | "neutral";
  sparkSeed: number;
  sparkTone?: "primary" | "neutral" | "green";
  flatSpark?: boolean;
  onClick?: () => void;
  active?: boolean;
}) {
  const content = (
    <>
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
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 ${
          active ? "bg-muted/50" : ""
        }`}
      >
        {content}
      </button>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3">
      {content}
    </div>
  );
}

export function PurchaseOrdersMetricsBar({
  stats,
  activeDeliveryFilter,
  allFiltersClear = true,
  onDeliveryFilter,
  onClearFilters,
  onExport,
}: {
  stats: PurchaseOrderCatalogStats;
  activeDeliveryFilter?: PurchaseOrderDeliveryFilter | null;
  allFiltersClear?: boolean;
  onDeliveryFilter?: (delivery: PurchaseOrderDeliveryFilter | null) => void;
  onClearFilters?: () => void;
  onExport: () => void;
}) {
  const vendorQueue = stats.pendingCount + stats.acceptedCount;
  const queueTrend =
    vendorQueue > 0 ? `${stats.pendingCount} pending` : "0 pending";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Purchase orders
          </h1>
          <p className="text-sm text-muted-foreground">
            Vendor supply POs. Track expected deliveries and submit receipt from PO detail.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/purchase-orders?form=new" className={buttonVariants({ size: "sm" })}>
            Create purchase order
          </Link>
          <Button variant="outline" size="sm" onClick={onExport}>
            <Download data-icon="inline-start" />
            Export
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
              More actions
              <ChevronDown data-icon="inline-end" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={onExport}>
                  Export all on page
                </DropdownMenuItem>
                <DropdownMenuItem
                  nativeButton={false}
                  render={<Link href="/admin/erp/purchase-orders" />}
                >
                  ERP purchase orders
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Card className="overflow-hidden border border-border py-0 ring-0">
        <div className="flex flex-col lg:flex-row lg:divide-x lg:divide-border">
          <MetricSegment
            label="All POs"
            value={stats.totalPurchaseOrders.toLocaleString("en-IN")}
            trend={
              stats.cancelledCount > 0
                ? `${stats.cancelledCount} cancelled`
                : undefined
            }
            trendTone="neutral"
            sparkSeed={stats.totalPurchaseOrders}
            onClick={onClearFilters}
            active={allFiltersClear}
          />
          <MetricSegment
            label="Vendor queue"
            value={vendorQueue.toLocaleString("en-IN")}
            trend={queueTrend}
            trendTone="neutral"
            sparkSeed={vendorQueue + 3}
            sparkTone="neutral"
          />
          <MetricSegment
            label="Due this week"
            value={stats.dueThisWeekCount.toLocaleString("en-IN")}
            trend={stats.dueThisWeekCount > 0 ? "Expected arrivals" : undefined}
            trendTone="neutral"
            sparkSeed={stats.dueThisWeekCount + 5}
            sparkTone="primary"
            onClick={
              onDeliveryFilter
                ? () => onDeliveryFilter("due_this_week")
                : undefined
            }
            active={activeDeliveryFilter === "due_this_week"}
          />
          <MetricSegment
            label="Overdue"
            value={stats.overdueCount.toLocaleString("en-IN")}
            trend={stats.overdueCount > 0 ? "Past expected date" : undefined}
            trendTone={stats.overdueCount > 0 ? "down" : "neutral"}
            sparkSeed={stats.overdueCount + 9}
            sparkTone="neutral"
            flatSpark={stats.overdueCount === 0}
            onClick={
              onDeliveryFilter ? () => onDeliveryFilter("overdue") : undefined
            }
            active={activeDeliveryFilter === "overdue"}
          />
          <MetricSegment
            label="Awaiting receipt"
            value={stats.awaitingReceiptCount.toLocaleString("en-IN")}
            trend={
              stats.awaitingReceiptCount > 0 ? "Needs internal receive" : undefined
            }
            trendTone="neutral"
            sparkSeed={stats.awaitingReceiptCount + 13}
            sparkTone="green"
            onClick={
              onDeliveryFilter
                ? () => onDeliveryFilter("awaiting_receipt")
                : undefined
            }
            active={activeDeliveryFilter === "awaiting_receipt"}
          />
        </div>
      </Card>
    </div>
  );
}
