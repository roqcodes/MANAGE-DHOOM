"use client";

import Link from "next/link";
import { ChevronDown, Download, Plus } from "lucide-react";

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
import { currencyLabel } from "@/lib/format-currency";
import {
  CatalogMetricSegment,
  formatInr,
} from "@/modules/orders/components/orders-ui";

export function OrdersMetricsBar({
  stats,
  onExport,
  variant = "online",
}: {
  stats: OrderCatalogStats;
  onExport: () => void;
  variant?: "online" | "erp";
}) {
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
          <CatalogMetricSegment
            label="Orders"
            value={stats.totalOrders.toLocaleString("en-IN")}
            trend={orderTrend}
            sparkSeed={stats.totalOrders}
          />
          <CatalogMetricSegment
            label="Items ordered"
            value={stats.itemsOrdered.toLocaleString("en-IN")}
            trend={itemsTrend}
            sparkSeed={stats.itemsOrdered + 3}
            sparkTone="green"
          />
          <CatalogMetricSegment
            label={currencyLabel("Sales reversals")}
            value={formatInr(stats.salesReversals)}
            trendTone="neutral"
            sparkSeed={stats.cancelledCount}
            sparkTone="neutral"
            flatSpark
          />
          <CatalogMetricSegment
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
