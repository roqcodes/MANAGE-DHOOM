"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { isAgingMinMaxFilterActive } from "./aging-age-filter-model";

export function AgingReportAgeFilter({
  fieldLabel = "Age",
  unitLabel = "days",
  ageMin,
  ageMax,
  onAgeMinChange,
  onAgeMaxChange,
  onClear,
  idPrefix = "aging-age",
  className,
}: {
  fieldLabel?: string;
  unitLabel?: string;
  ageMin: string;
  ageMax: string;
  onAgeMinChange: (value: string) => void;
  onAgeMaxChange: (value: string) => void;
  onClear?: () => void;
  idPrefix?: string;
  className?: string;
}) {
  const active = isAgingMinMaxFilterActive(ageMin, ageMax);

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
              min={0}
              step={1}
              inputMode="numeric"
              placeholder="—"
              value={ageMin}
              onChange={(e) => onAgeMinChange(e.target.value)}
              className="h-8 w-[5rem] tabular-nums"
              aria-label={`Minimum ${fieldLabel.toLowerCase()} in ${unitLabel}`}
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
              min={0}
              step={1}
              inputMode="numeric"
              placeholder="—"
              value={ageMax}
              onChange={(e) => onAgeMaxChange(e.target.value)}
              className="h-8 w-[5rem] tabular-nums"
              aria-label={`Maximum ${fieldLabel.toLowerCase()} in ${unitLabel}`}
            />
            <span className="text-xs text-muted-foreground">{unitLabel}</span>
          </div>
        </div>
        {active && onClear ? (
          <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={onClear}>
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}
