"use client";

import type { UiMetricsBlock } from "../../lib/parse-ui";
import { PresentShell } from "./PresentShell";

export function PresentMetrics({ block }: { block: UiMetricsBlock }) {
  const items = block.items.slice(0, 6);
  return (
    <PresentShell title={block.title}>
      <div
        className={cnGrid(items.length)}
        role="list"
        aria-label={block.title ?? "Summary metrics"}
      >
        {items.map((item) => (
          <div
            key={item.label}
            className="bg-background/80 px-3 py-2"
            role="listitem"
          >
            <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
              {item.label}
            </p>
            <p className="mt-0.5 font-semibold tabular-nums text-[12px] text-foreground">
              {item.value}
            </p>
          </div>
        ))}
      </div>
    </PresentShell>
  );
}

function cnGrid(count: number) {
  if (count <= 2) return "grid grid-cols-2 gap-px bg-white/10";
  if (count === 3) return "grid grid-cols-3 gap-px bg-white/10";
  return "grid grid-cols-2 gap-px bg-white/10 sm:grid-cols-4";
}
