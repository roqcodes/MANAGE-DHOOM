"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AgingReportAgeFilter({
  ageMin,
  ageMax,
  onAgeMinChange,
  onAgeMaxChange,
}: {
  ageMin: string;
  ageMax: string;
  onAgeMinChange: (value: string) => void;
  onAgeMaxChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="grid gap-1">
        <Label htmlFor="aging-age-min" className="text-xs text-muted-foreground">
          Min age (days)
        </Label>
        <Input
          id="aging-age-min"
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          placeholder="Any"
          value={ageMin}
          onChange={(e) => onAgeMinChange(e.target.value)}
          className="h-8 w-[7.5rem] tabular-nums"
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="aging-age-max" className="text-xs text-muted-foreground">
          Max age (days)
        </Label>
        <Input
          id="aging-age-max"
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          placeholder="Any"
          value={ageMax}
          onChange={(e) => onAgeMaxChange(e.target.value)}
          className="h-8 w-[7.5rem] tabular-nums"
        />
      </div>
    </div>
  );
}
