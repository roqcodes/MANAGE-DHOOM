"use client";

import { Ban, Factory, Landmark, PackageCheck, Plane, ReceiptText, Ship } from "lucide-react";

import type { PurchaseOrderStatusFilter } from "@/common/admin/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const PATH_PHASES: {
  id: "production" | "shipping" | "received" | "invoice";
  label: string;
  detail: string;
  icon: typeof Factory;
  status?: PurchaseOrderStatusFilter;
  accent: "indigo" | "emerald" | "violet" | "rose";
}[] = [
  {
    id: "production",
    status: "production",
    label: "Production",
    detail: "At supplier",
    icon: Factory,
    accent: "indigo",
  },
  {
    id: "shipping",
    label: "Shipping",
    detail: "Transit & clearance",
    icon: Ship,
    accent: "indigo",
  },
  {
    id: "received",
    status: "received",
    label: "Received",
    detail: "In warehouse",
    icon: PackageCheck,
    accent: "emerald",
  },
  {
    id: "invoice",
    status: "fully_received",
    label: "Invoice",
    detail: "Finalized",
    icon: ReceiptText,
    accent: "violet",
  },
];

const SHIPPING_MODES = [
  {
    status: "by_air" as const,
    label: "Air",
    icon: Plane,
    accent: {
      icon: "bg-violet-500/15 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
      hover: "hover:bg-violet-500/10",
      active: "bg-violet-500/15 ring-1 ring-violet-500/30",
      count: "text-violet-800 dark:text-violet-200",
    },
  },
  {
    status: "by_sea" as const,
    label: "Sea",
    icon: Ship,
    accent: {
      icon: "bg-sky-500/15 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
      hover: "hover:bg-sky-500/10",
      active: "bg-sky-500/15 ring-1 ring-sky-500/30",
      count: "text-sky-800 dark:text-sky-200",
    },
  },
  {
    status: "in_customs" as const,
    label: "Customs",
    icon: Landmark,
    accent: {
      icon: "bg-amber-500/15 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200",
      hover: "hover:bg-amber-500/10",
      active: "bg-amber-500/15 ring-1 ring-amber-500/30",
      count: "text-amber-900 dark:text-amber-100",
    },
  },
];

const STAGE_ACCENT = {
  indigo: {
    icon: "bg-indigo-500/15 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300",
    active: "bg-indigo-500/10 ring-1 ring-indigo-500/25",
    count: "text-indigo-800 dark:text-indigo-200",
  },
  emerald: {
    icon: "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
    active: "bg-emerald-500/10 ring-1 ring-emerald-500/25",
    count: "text-emerald-800 dark:text-emerald-200",
  },
  violet: {
    icon: "bg-violet-500/15 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
    active: "bg-violet-500/10 ring-1 ring-violet-500/25",
    count: "text-violet-800 dark:text-violet-200",
  },
  rose: {
    icon: "bg-rose-500/15 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
    active: "bg-rose-500/10 ring-1 ring-rose-500/25",
    count: "text-rose-800 dark:text-rose-200",
  },
} as const;

function formatCount(value: number) {
  return value.toLocaleString("en-IN");
}

function isShippingStatus(status: PurchaseOrderStatusFilter) {
  return status === "by_air" || status === "by_sea" || status === "in_customs";
}

function StageMeta({
  icon: Icon,
  label,
  detail,
  count,
  quiet,
  accent,
  active,
}: {
  icon: typeof Factory;
  label: string;
  detail: string;
  count: number;
  quiet: boolean;
  accent: keyof typeof STAGE_ACCENT;
  active: boolean;
}) {
  const tone = STAGE_ACCENT[accent];
  return (
    <>
      <span className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
          <span
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-md",
              tone.icon,
              active && "ring-2 ring-background",
            )}
          >
            <Icon className="size-3.5" aria-hidden />
          </span>
          <span className="truncate">{label}</span>
        </span>
        <span
          className={cn(
            "text-xl font-semibold tabular-nums tracking-tight",
            active ? tone.count : quiet ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {formatCount(count)}
        </span>
      </span>
      <span className="mt-0.5 block truncate pl-9 text-xs text-muted-foreground">{detail}</span>
    </>
  );
}

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
  const shippingModeValues = {
    by_air: stats.byAirCount,
    by_sea: stats.bySeaCount,
    in_customs: stats.inCustomsCount,
  };
  const filtered = activeStatus !== "all";
  const shippingAnyActive = isShippingStatus(activeStatus);

  return (
    <Card className="border-border bg-gradient-to-br from-background via-background to-muted/20 py-0 ring-0">
      <div className="flex items-center justify-between gap-3 border-b border-border/80 bg-muted/15 px-4 py-3 sm:px-6">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          Purchase order journey
        </h2>
        {filtered ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onSelect("all")}
            className="h-7 px-2 text-xs text-muted-foreground"
          >
            Clear filter
          </Button>
        ) : null}
      </div>

      <nav
        aria-label="Filter purchase orders by lifecycle stage"
        className="px-4 py-4 sm:px-6"
      >
        <div className="flex min-w-0 flex-col lg:flex-row lg:items-stretch">
          <ol className="m-0 flex min-w-0 flex-1 list-none flex-col gap-2 p-0 sm:flex-row sm:items-stretch sm:gap-0">
            {PATH_PHASES.map((phase, index) => {
              const isShipping = phase.id === "shipping";
              const count = isShipping
                ? 0
                : phase.status === "production"
                  ? stats.productionCount
                  : phase.status === "received"
                    ? stats.receivedCount
                    : stats.invoiceCount;
              const active = isShipping
                ? shippingAnyActive
                : activeStatus === phase.status;
              const Icon = phase.icon;
              const quiet = count === 0 && !active;
              const tone = STAGE_ACCENT[phase.accent];

              return (
                <li key={phase.id} className="flex min-w-0 flex-1 items-stretch sm:min-w-[8.5rem]">
                  {isShipping ? (
                    <div
                      role="group"
                      aria-label="Shipping modes"
                      className={cn(
                        "min-w-0 flex-1 rounded-lg px-1 py-2 sm:px-1.5",
                        shippingAnyActive && "bg-sky-500/5 ring-1 ring-sky-500/20",
                      )}
                    >
                      <div className="grid w-full grid-cols-3 gap-0.5">
                        {SHIPPING_MODES.map((mode) => {
                          const modeActive = activeStatus === mode.status;
                          const ModeIcon = mode.icon;
                          const value = shippingModeValues[mode.status];
                          return (
                            <button
                              key={mode.status}
                              type="button"
                              aria-pressed={modeActive}
                              aria-label={`Filter purchase orders: ${mode.label}`}
                              onClick={() => onSelect(modeActive ? "all" : mode.status)}
                              className={cn(
                                "flex min-w-0 flex-col items-center gap-0.5 rounded-md px-1 py-1 text-center transition-colors duration-150",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                                mode.accent.hover,
                                modeActive ? mode.accent.active : "hover:bg-muted/40",
                              )}
                            >
                              <span
                                className={cn(
                                  "flex size-7 items-center justify-center rounded-md",
                                  mode.accent.icon,
                                  modeActive && "ring-2 ring-background",
                                )}
                              >
                                <ModeIcon className="size-3.5" aria-hidden />
                              </span>
                              <span className="w-full truncate text-[11px] font-medium leading-tight text-muted-foreground">
                                {mode.label}
                              </span>
                              <span
                                className={cn(
                                  "text-lg font-semibold leading-none tabular-nums tracking-tight",
                                  value === 0 && !modeActive
                                    ? "text-muted-foreground"
                                    : mode.accent.count,
                                )}
                              >
                                {formatCount(value)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      aria-pressed={active}
                      aria-label={`Filter purchase orders: ${phase.label}`}
                      onClick={() => onSelect(active ? "all" : phase.status!)}
                      className={cn(
                        "min-w-0 flex-1 rounded-lg px-2 py-2 text-left transition-colors duration-150 sm:px-1.5",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        active ? tone.active : "hover:bg-muted/40",
                      )}
                    >
                      <StageMeta
                        icon={Icon}
                        label={phase.label}
                        detail={phase.detail}
                        count={count}
                        quiet={quiet}
                        accent={phase.accent}
                        active={active}
                      />
                    </button>
                  )}
                  {index < PATH_PHASES.length - 1 ? (
                    <span
                      className="mx-1 hidden w-px shrink-0 self-stretch bg-gradient-to-b from-transparent via-border to-transparent sm:mx-2 sm:block"
                      aria-hidden
                    />
                  ) : null}
                </li>
              );
            })}
          </ol>

          <span
            className="mx-0 my-3 h-px w-full bg-border lg:my-0 lg:mx-3 lg:h-auto lg:w-px lg:self-stretch"
            aria-hidden
          />

          <button
            type="button"
            aria-pressed={activeStatus === "cancelled"}
            aria-label="Filter purchase orders: Cancelled"
            onClick={() =>
              onSelect(activeStatus === "cancelled" ? "all" : "cancelled")
            }
            className={cn(
              "min-w-[8.5rem] shrink-0 rounded-lg px-2 py-2 text-left transition-colors duration-150 sm:px-1.5",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              activeStatus === "cancelled"
                ? STAGE_ACCENT.rose.active
                : "hover:bg-rose-500/5",
            )}
          >
            <StageMeta
              icon={Ban}
              label="Cancelled"
              detail="Closed before completion"
              count={stats.cancelledCount}
              quiet={stats.cancelledCount === 0 && activeStatus !== "cancelled"}
              accent="rose"
              active={activeStatus === "cancelled"}
            />
          </button>
        </div>
      </nav>
    </Card>
  );
}