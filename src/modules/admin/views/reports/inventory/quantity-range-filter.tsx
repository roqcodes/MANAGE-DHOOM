"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type QuantityBounds = { min?: number; max?: number };

export function parseQuantityInput(raw?: string | null): number | undefined {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

/** Inclusive bounds: quantity >= min, quantity <= max. Swaps when min > max. */
export function resolveQuantityBounds(
  minRaw: string,
  maxRaw: string,
): QuantityBounds {
  const min = parseQuantityInput(minRaw);
  const max = parseQuantityInput(maxRaw);
  if (min != null && max != null && min > max) {
    return { min: max, max: min };
  }
  return { min, max };
}

export function isQuantityFilterActive(minRaw: string, maxRaw: string) {
  const { min, max } = resolveQuantityBounds(minRaw, maxRaw);
  return min != null || max != null;
}

export function matchesQuantityBounds(value: unknown, bounds: QuantityBounds) {
  if (bounds.min == null && bounds.max == null) return true;
  const qty = Number(value ?? 0);
  if (!Number.isFinite(qty)) return false;
  if (bounds.min != null && qty < bounds.min) return false;
  if (bounds.max != null && qty > bounds.max) return false;
  return true;
}

export function QuantityRangeFilter({
  fieldLabel = "Stock quantity",
  unitLabel = "units",
  min,
  max,
  onMinChange,
  onMaxChange,
  onClear,
  idPrefix = "quantity-range",
  className,
}: {
  fieldLabel?: string;
  unitLabel?: string;
  min: string;
  max: string;
  onMinChange: (value: string) => void;
  onMaxChange: (value: string) => void;
  onClear?: () => void;
  idPrefix?: string;
  className?: string;
}) {
  const active = isQuantityFilterActive(min, max);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-xs font-medium text-muted-foreground">{fieldLabel}</span>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${idPrefix}-min`} className="text-xs font-normal text-muted-foreground">
            Min
          </Label>
          <div className="flex items-center gap-1.5">
            <Input
              id={`${idPrefix}-min`}
              type="number"
              step="any"
              inputMode="decimal"
              placeholder="—"
              value={min}
              onChange={(e) => onMinChange(e.target.value)}
              className="h-8 w-[6rem] tabular-nums"
              aria-label={`Minimum ${fieldLabel.toLowerCase()}`}
            />
            <span className="text-xs text-muted-foreground">{unitLabel}</span>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${idPrefix}-max`} className="text-xs font-normal text-muted-foreground">
            Max
          </Label>
          <div className="flex items-center gap-1.5">
            <Input
              id={`${idPrefix}-max`}
              type="number"
              step="any"
              inputMode="decimal"
              placeholder="—"
              value={max}
              onChange={(e) => onMaxChange(e.target.value)}
              className="h-8 w-[6rem] tabular-nums"
              aria-label={`Maximum ${fieldLabel.toLowerCase()}`}
            />
            <span className="text-xs text-muted-foreground">{unitLabel}</span>
          </div>
        </div>
        {active && onClear ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={onClear}
          >
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function formatQuantityBoundsLabel(bounds: QuantityBounds): string {
  if (bounds.min == null && bounds.max == null) return "";
  if (bounds.min != null && bounds.max != null) {
    if (bounds.min === bounds.max) return `${bounds.min} units`;
    return `${bounds.min}–${bounds.max} units`;
  }
  if (bounds.min != null) return `≥ ${bounds.min} units`;
  return `≤ ${bounds.max} units`;
}
