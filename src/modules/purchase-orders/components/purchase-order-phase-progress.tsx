"use client";

import {
  Ban,
  ChevronRight,
  Factory,
  Landmark,
  PackageCheck,
  Plane,
  ReceiptText,
  Ship,
} from "lucide-react";

import type { PurchaseOrderStatusFilter } from "@/common/admin/types";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const PHASES: {
  id: string;
  label: string;
  detail: string;
  icon: typeof Factory;
  status?: PurchaseOrderStatusFilter;
  tone: "indigo" | "sky" | "emerald" | "violet" | "rose";
}[] = [
  { id: "production", status: "production", label: "Production", detail: "At supplier", icon: Factory, tone: "indigo" },
  { id: "shipping", label: "Shipping", detail: "Transit & clearance", icon: Ship, tone: "sky" },
  { id: "received", status: "received", label: "Received", detail: "In warehouse", icon: PackageCheck, tone: "emerald" },
  { id: "invoice", status: "fully_received", label: "Invoice", detail: "Finalized", icon: ReceiptText, tone: "violet" },
  { id: "cancelled", status: "cancelled", label: "Cancelled", detail: "Closed before completion", icon: Ban, tone: "rose" },
];

const TONE_STYLES = {
  indigo: {
    icon: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300",
    active: "border-indigo-300 bg-indigo-50/70 ring-1 ring-indigo-200 dark:border-indigo-800 dark:bg-indigo-950/30 dark:ring-indigo-900",
    number: "text-indigo-700 dark:text-indigo-300",
  },
  sky: {
    icon: "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
    active: "border-sky-300 bg-sky-50/70 ring-1 ring-sky-200 dark:border-sky-800 dark:bg-sky-950/30 dark:ring-sky-900",
    number: "text-sky-700 dark:text-sky-300",
  },
  emerald: {
    icon: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
    active: "border-emerald-300 bg-emerald-50/70 ring-1 ring-emerald-200 dark:border-emerald-800 dark:bg-emerald-950/30 dark:ring-emerald-900",
    number: "text-emerald-700 dark:text-emerald-300",
  },
  violet: {
    icon: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
    active: "border-violet-300 bg-violet-50/70 ring-1 ring-violet-200 dark:border-violet-800 dark:bg-violet-950/30 dark:ring-violet-900",
    number: "text-violet-700 dark:text-violet-300",
  },
  rose: {
    icon: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
    active: "border-rose-300 bg-rose-50/70 ring-1 ring-rose-200 dark:border-rose-800 dark:bg-rose-950/30 dark:ring-rose-900",
    number: "text-rose-700 dark:text-rose-300",
  },
} as const;

export function PurchaseOrderPhaseProgress({
  stats,
  activeStatus,
  onSelect,
}: {
  stats: {
    productionCount: number;
    byAirCount: number;
    bySeaCount: number;
    inCustomsCount: number;
    receivedCount: number;
    invoiceCount: number;
    cancelledCount: number;
  };
  activeStatus: PurchaseOrderStatusFilter;
  onSelect: (status: PurchaseOrderStatusFilter) => void;
}) {
  return (
    <Card className="overflow-hidden border border-border/70 py-0 shadow-sm ring-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/20 px-4 py-3.5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Purchase order journey
          </p>
          <h2 className="mt-0.5 text-sm font-semibold tracking-tight">Lifecycle overview</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Choose a stage to filter the purchase order list
          </p>
        </div>
        {activeStatus !== "all" ? (
          <button
            type="button"
            onClick={() => onSelect("all")}
            className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Clear phase
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-2.5 bg-muted/10 p-3 sm:grid-cols-2 xl:grid-cols-5">
        {PHASES.map((phase, index) => {
          const isShipping = phase.id === "shipping";
          const active = isShipping
            ? activeStatus === "by_air" || activeStatus === "by_sea" || activeStatus === "in_customs"
            : activeStatus === phase.status;
          const count = isShipping
            ? stats.byAirCount + stats.bySeaCount + stats.inCustomsCount
            : phase.status === "production"
            ? stats.productionCount
            : phase.status === "received"
              ? stats.receivedCount
              : phase.status === "fully_received"
                ? stats.invoiceCount
                : phase.status === "cancelled"
                  ? stats.cancelledCount
                  : 0;
          const Icon = phase.icon;
          return (
            <div
              key={phase.id}
              className={cn(
                "group relative flex min-h-[112px] min-w-0 items-start gap-3 rounded-xl border border-border/70 bg-card px-3.5 py-3.5 shadow-sm transition-all duration-200 motion-reduce:transition-none hover:-translate-y-0.5 hover:border-border hover:shadow-md active:translate-y-0 active:scale-[0.99] sm:px-4",
                active && TONE_STYLES[phase.tone].active,
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl transition-all duration-200 group-hover:scale-105",
                  TONE_STYLES[phase.tone].icon,
                  active && "ring-2 ring-background shadow-sm",
                )}
              >
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className={cn("truncate text-sm font-semibold tracking-tight", active && TONE_STYLES[phase.tone].number)}>
                    {phase.label}
                  </span>
                  <span className={cn("text-lg font-bold tabular-nums tracking-tight text-foreground", active && TONE_STYLES[phase.tone].number)}>
                    {count.toLocaleString("en-IN")}
                  </span>
                </span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">
                  {phase.detail}
                </span>
                {isShipping ? (
                  <span className="mt-2.5 grid grid-cols-3 gap-1.5">
                    {([
                      { status: "by_air", label: "Air", value: stats.byAirCount, icon: Plane },
                      { status: "by_sea", label: "Sea", value: stats.bySeaCount, icon: Ship },
                      { status: "in_customs", label: "Customs", value: stats.inCustomsCount, icon: Landmark },
                    ] as const).map((mode) => {
                      const modeActive = activeStatus === mode.status;
                      const ModeIcon = mode.icon;
                      return (
                        <button
                          key={mode.status}
                          type="button"
                          aria-pressed={modeActive}
                          onClick={() => onSelect(modeActive ? "all" : mode.status)}
                          className={cn(
                            "flex min-w-0 flex-col items-center rounded-lg border px-1 py-1.5 text-[10px] leading-tight transition-all duration-150 hover:-translate-y-px hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                            modeActive
                              ? mode.status === "by_air"
                                ? "border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-200"
                                : mode.status === "by_sea"
                                  ? "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-200"
                                  : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
                              : "border-border/60 bg-muted/30 text-muted-foreground hover:border-border hover:bg-background",
                          )}
                        >
                          <span className="flex items-center gap-1">
                            <ModeIcon className="size-3" aria-hidden />
                            {mode.label}
                          </span>
                          <span className="mt-1 text-xs font-bold tabular-nums text-foreground">
                            {mode.value.toLocaleString("en-IN")}
                          </span>
                        </button>
                      );
                    })}
                  </span>
                ) : (
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => onSelect(active ? "all" : phase.status!)}
                    aria-label={`Filter purchase orders: ${phase.label}`}
                    className="absolute inset-0 z-0 rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  />
                )}
              </span>
              {index < PHASES.length - 1 ? <ChevronRight className="absolute -right-2 top-1/2 z-10 hidden size-5 -translate-y-1/2 rounded-full border border-border/70 bg-background p-0.5 text-muted-foreground shadow-sm xl:block" aria-hidden /> : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
