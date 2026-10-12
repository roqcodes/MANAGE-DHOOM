"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarRange, Check } from "lucide-react";
import type { DateRange } from "react-day-picker";

import {
  ADMIN_DATE_PRESET_OPTIONS,
  type AdminDatePreset,
  type AdminDateRangeValue,
  adminDateRangeButtonLabel,
  applyAdminDatePreset,
  detectAdminDatePreset,
} from "@/modules/admin/lib/admin-date-range";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  InputGroupAddon,
  InputGroupButton,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

export type AdminDateRangePickerProps = {
  value: AdminDateRangeValue;
  onChange: (next: AdminDateRangeValue) => void;
  allowAll?: boolean;
  presetIds?: AdminDatePreset[];
  variant?: "toolbar" | "standalone" | "header";
  className?: string;
  align?: "start" | "center" | "end";
};

export function AdminDateRangePicker({
  value,
  onChange,
  allowAll = true,
  presetIds,
  variant = "toolbar",
  className,
  align = "end",
}: AdminDateRangePickerProps) {
  const [open, setOpen] = useState(false);

  const presets = useMemo(() => {
    const ids = presetIds ?? ADMIN_DATE_PRESET_OPTIONS.map((o) => o.id);
    return ADMIN_DATE_PRESET_OPTIONS.filter(
      (o) => ids.includes(o.id) && (allowAll || o.id !== "all"),
    );
  }, [allowAll, presetIds]);

  const calendarRange: DateRange = useMemo(
    () => ({
      from: value.from ? new Date(`${value.from}T00:00:00`) : undefined,
      to: value.to ? new Date(`${value.to}T00:00:00`) : undefined,
    }),
    [value.from, value.to],
  );

  const label = adminDateRangeButtonLabel(value);

  function selectPreset(preset: AdminDatePreset) {
    if (preset === "custom") {
      onChange({ ...value, preset: "custom" });
      return;
    }
    onChange(applyAdminDatePreset(preset));
    setOpen(false);
  }

  const trigger =
    variant === "toolbar" ? (
      <InputGroupButton
        variant="ghost"
        size="sm"
        className={cn("max-w-[200px] gap-1.5 truncate px-2", className)}
        aria-label={`Date range: ${label}`}
      >
        <CalendarRange className="size-3.5 shrink-0 opacity-70" />
        <span className="truncate">{label}</span>
      </InputGroupButton>
    ) : variant === "header" ? (
      <button
        type="button"
        className={cn(
          "flex h-10 max-w-[11.5rem] min-w-[8.5rem] items-center gap-2 rounded-xl border border-slate-200/80 bg-white/90 px-3 text-left text-sm shadow-sm shadow-slate-900/[0.04] outline-none",
          "transition-all duration-300 ease-out hover:border-[#EB205F]/30 hover:bg-white hover:shadow-md hover:shadow-[#EB205F]/[0.07]",
          "focus-visible:border-[#EB205F]/40 focus-visible:ring-2 focus-visible:ring-[#EB205F]/15",
          className,
        )}
        aria-label={`Date range: ${label}`}
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400">
          <CalendarRange className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 truncate font-medium text-slate-700">{label}</span>
      </button>
    ) : (
      <Button
        variant="outline"
        size="sm"
        className={cn("max-w-[240px] justify-start gap-1.5 font-normal", className)}
        aria-label={`Date range: ${label}`}
      >
        <CalendarRange data-icon="inline-start" className="size-3.5 opacity-70" />
        <span className="truncate">{label}</span>
      </Button>
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={trigger} />
      <PopoverContent align={align} className="w-auto max-w-[calc(100vw-2rem)] p-0">
        <PopoverHeader className="border-b px-3 py-2">
          <PopoverTitle className="text-sm">Date range</PopoverTitle>
        </PopoverHeader>
        <div className="flex flex-col sm:flex-row">
          <div className="flex max-h-72 flex-col gap-0.5 overflow-y-auto border-b p-2 sm:max-h-none sm:w-44 sm:border-b-0 sm:border-r">
            {presets
              .filter((p) => p.id !== "custom")
              .map((preset) => (
                <Button
                  key={preset.id}
                  type="button"
                  variant={value.preset === preset.id ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 justify-between px-2.5 text-xs font-normal"
                  onClick={() => selectPreset(preset.id)}
                >
                  {preset.label}
                  {value.preset === preset.id ? (
                    <Check className="size-3.5 opacity-70" />
                  ) : null}
                </Button>
              ))}
            <Button
              type="button"
              variant={value.preset === "custom" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 justify-between px-2.5 text-xs font-normal"
              onClick={() => selectPreset("custom")}
            >
              Custom range
              {value.preset === "custom" ? (
                <Check className="size-3.5 opacity-70" />
              ) : null}
            </Button>
          </div>
          <div className="p-2">
            <Calendar
              mode="range"
              numberOfMonths={2}
              defaultMonth={calendarRange.from ?? new Date()}
              selected={calendarRange}
              onSelect={(next) => {
                if (!next?.from) return;
                const from = format(next.from, "yyyy-MM-dd");
                const to = format(next.to ?? next.from, "yyyy-MM-dd");
                onChange({
                  preset: detectAdminDatePreset(from, to),
                  from,
                  to,
                });
              }}
            />
            {value.from && value.to ? (
              <p className="mt-1 px-1 text-center text-[11px] text-muted-foreground">
                {format(new Date(`${value.from}T00:00:00`), "MMM d, yyyy")} –{" "}
                {format(new Date(`${value.to}T00:00:00`), "MMM d, yyyy")}
              </p>
            ) : null}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Divider + date picker addon for AdminListCard toolbar */
export function AdminListDateRangeAddon(props: AdminDateRangePickerProps) {
  return (
    <>
      <InputGroupAddon align="inline-end" className="px-0">
        <div className="h-4 w-px bg-border" aria-hidden />
      </InputGroupAddon>
      <InputGroupAddon align="inline-end" className="pr-1">
        <AdminDateRangePicker {...props} variant="toolbar" />
      </InputGroupAddon>
    </>
  );
}
