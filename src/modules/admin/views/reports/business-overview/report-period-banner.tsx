"use client";

import { CalendarRange, Store } from "lucide-react";

import { cn } from "@/lib/utils";

export function ReportPeriodBanner({
  periodLabel,
  storeLabel,
  className,
}: {
  periodLabel: string;
  storeLabel?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <CalendarRange className="size-4 shrink-0 opacity-70" aria-hidden />
        <span>
          Report period:{" "}
          <span className="font-medium text-foreground">{periodLabel}</span>
        </span>
      </div>
      {storeLabel ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Store className="size-4 shrink-0 opacity-70" aria-hidden />
          <span>
            Store: <span className="font-medium text-foreground">{storeLabel}</span>
          </span>
        </div>
      ) : null}
    </div>
  );
}
