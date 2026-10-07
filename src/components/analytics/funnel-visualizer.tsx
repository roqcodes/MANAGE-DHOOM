"use client";

import type { FunnelStage } from "@/common/analytics/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function FunnelVisualizer({
  stages,
  className,
}: {
  stages: FunnelStage[];
  className?: string;
}) {
  const max = Math.max(...stages.map((s) => s.count), 1);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {stages.map((stage, i) => {
        const widthPct = Math.max(12, (stage.count / max) * 100);
        return (
          <div key={stage.key} className="flex flex-col gap-1.5">
            {i > 0 && stage.dropOffPct != null ? (
              <div className="flex justify-center">
                <Badge
                  variant="outline"
                  className="border-border text-[10px] font-medium text-muted-foreground"
                >
                  −{stage.dropOffPct}% drop-off
                </Badge>
              </div>
            ) : null}
            <div className="flex items-center gap-3">
              <div className="w-28 shrink-0 text-xs font-medium text-muted-foreground">
                {stage.label}
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className="flex h-9 items-center rounded-md bg-primary/15 px-3 transition-[width]"
                  style={{ width: `${widthPct}%` }}
                >
                  <span className="truncate text-sm font-semibold tabular-nums text-foreground">
                    {stage.count.toLocaleString("en-IN")}
                  </span>
                  <span className="ml-1.5 text-[10px] font-medium text-muted-foreground">
                    customers
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
