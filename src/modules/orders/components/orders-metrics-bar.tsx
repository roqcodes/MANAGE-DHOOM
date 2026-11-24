"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

import { DataExportMenu } from "@/components/export/data-export-menu";
import type { TabularExportSource } from "@/lib/export/tabular-export";

import type { OrderCatalogStats } from "@/common/admin/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AdminPrimaryAction } from "@/modules/admin/ui";
import { currencyLabel } from "@/lib/format-currency";
import {
  CatalogMetricSegment,
  formatInr,
} from "@/modules/orders/components/orders-ui";

export function OrdersMetricsBar({
  stats,
  exportSource,
  onExport,
  variant = "online",
  valuesLoading = false,
}: {
  stats: OrderCatalogStats;
  exportSource?: TabularExportSource;
  onExport?: () => void;
  variant?: "online" | "erp";
  valuesLoading?: boolean;
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
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {variant === "erp" ? (
            <AdminPrimaryAction
              nativeButton={false}
              render={<Link href="/admin/erp/sales-orders?form=new" />}
            >
              <Plus data-icon="inline-start" />
              Add sales order
            </AdminPrimaryAction>
          ) : (
            <AdminPrimaryAction
              nativeButton={false}
              render={<Link href="/admin/billing" />}
            >
              POS billing
            </AdminPrimaryAction>
          )}
          {exportSource ? (
            <DataExportMenu source={exportSource} />
          ) : onExport ? (
            <Button
              variant="outline"
              size="page"
              className="rounded-full"
              onClick={onExport}
            >
              Export
            </Button>
          ) : null}
        </div>
      </div>

      <Card className="overflow-hidden border border-border py-0 ring-0">
        <div className="flex flex-col lg:flex-row lg:divide-x lg:divide-border">
          <CatalogMetricSegment
            label="Orders"
            value={stats.totalOrders.toLocaleString("en-IN")}
            trend={orderTrend}
            sparkSeed={stats.totalOrders}
            valuesLoading={valuesLoading}
          />
          <CatalogMetricSegment
            label="Items ordered"
            value={stats.itemsOrdered.toLocaleString("en-IN")}
            trend={itemsTrend}
            sparkSeed={stats.itemsOrdered + 3}
            sparkTone="green"
            valuesLoading={valuesLoading}
          />
          <CatalogMetricSegment
            label={currencyLabel("Sales reversals")}
            value={formatInr(stats.salesReversals)}
            trendTone="neutral"
            sparkSeed={stats.cancelledCount}
            sparkTone="neutral"
            flatSpark
            valuesLoading={valuesLoading}
          />
          <CatalogMetricSegment
            label="Orders fulfilled"
            value={stats.ordersFulfilled.toLocaleString("en-IN")}
            trend={fulfilledTrend}
            sparkSeed={stats.ordersFulfilled + 11}
            sparkTone="primary"
            valuesLoading={valuesLoading}
          />
        </div>
      </Card>
    </div>
  );
}
