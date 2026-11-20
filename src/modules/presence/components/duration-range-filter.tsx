"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type DurationBounds = { min?: number; max?: number };

export function parseDurationInput(raw?: string | null): number | undefined {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

/** Inclusive bounds in minutes: duration >= min, duration <= max. Swaps when min > max. */
export function resolveDurationBounds(
  minRaw: string,
  maxRaw: string,
): DurationBounds {
  const min = parseDurationInput(minRaw);
  const max = parseDurationInput(maxRaw);
  if (min != null && max != null && min > max) {
    return { min: max, max: min };
  }
  return { min, max };
}

export function isDurationFilterActive(minRaw: string, maxRaw: string): boolean {
  const { min, max } = resolveDurationBounds(minRaw, maxRaw);
  return min != null || max != null;
}

export function matchesDurationBounds(
  durationMinutes: number,
  bounds: DurationBounds,
): boolean {
  if (bounds.min == null && bounds.max == null) return true;
  if (!Number.isFinite(durationMinutes)) return false;
  if (bounds.min != null && durationMinutes < bounds.min) return false;
  if (bounds.max != null && durationMinutes > bounds.max) return false;
  return true;
}

export function DurationRangeFilter({
  min,
  max,
  onMinChange,
  onMaxChange,
  onClear,
  idPrefix = "duration-range",
  className,
}: {
  min: string;
  max: string;
  onMinChange: (value: string) => void;
  onMaxChange: (value: string) => void;
  onClear?: () => void;
  idPrefix?: string;
  className?: string;
}) {
  const active = isDurationFilterActive(min, max);

  const applyPreset = (presetMin: string, presetMax: string) => {
    onMinChange(presetMin);
    onMaxChange(presetMax);
  };

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-xs font-medium text-muted-foreground">Duration range</span>
      <div className="flex flex-wrap items-end gap-2.5">
        <div className="flex flex-col gap-1">
          <Label
            htmlFor={`${idPrefix}-min`}
            className="text-[11px] font-normal text-muted-foreground"
          >
            Min
          </Label>
          <div className="flex items-center gap-1">
            <Input
              id={`${idPrefix}-min`}
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              placeholder="0"
              value={min}
              onChange={(e) => onMinChange(e.target.value)}
              className="h-8 w-16 text-xs tabular-nums"
              aria-label="Minimum duration in minutes"
            />
            <span className="text-[11px] text-muted-foreground">m</span>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <Label
            htmlFor={`${idPrefix}-max`}
            className="text-[11px] font-normal text-muted-foreground"
          >
            Max
          </Label>
          <div className="flex items-center gap-1">
            <Input
              id={`${idPrefix}-max`}
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              placeholder="—"
              value={max}
              onChange={(e) => onMaxChange(e.target.value)}
              className="h-8 w-16 text-xs tabular-nums"
              aria-label="Maximum duration in minutes"
            />
            <span className="text-[11px] text-muted-foreground">m</span>
          </div>
        </div>

        {/* Quick presets */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => applyPreset("0", "15")}
            className={cn(
              "rounded px-2 py-1 text-[11px] font-medium border transition-colors",
              min === "0" && max === "15"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground",
            )}
          >
            &lt; 15m
          </button>
          <button
            type="button"
            onClick={() => applyPreset("15", "60")}
            className={cn(
              "rounded px-2 py-1 text-[11px] font-medium border transition-colors",
              min === "15" && max === "60"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground",
            )}
          >
            15m–1h
          </button>
          <button
            type="button"
            onClick={() => applyPreset("60", "240")}
            className={cn(
              "rounded px-2 py-1 text-[11px] font-medium border transition-colors",
              min === "60" && max === "240"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground",
            )}
          >
            1h–4h
          </button>
          <button
            type="button"
            onClick={() => applyPreset("240", "")}
            className={cn(
              "rounded px-2 py-1 text-[11px] font-medium border transition-colors",
              min === "240" && max === ""
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground",
            )}
          >
            &gt; 4h
          </button>
        </div>

        {active && onClear ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={onClear}
          >
            Reset
          </Button>
        ) : null}
      </div>
    </div>
  );
}
