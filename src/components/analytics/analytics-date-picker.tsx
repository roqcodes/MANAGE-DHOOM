"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  endOfDay,
  format,
  startOfDay,
  startOfQuarter,
  subDays,
} from "date-fns";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type FilterOption = { id: string; name: string };

const PRESETS = [
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 Days" },
  { id: "30d", label: "Last 30 Days" },
  { id: "qtd", label: "Quarter to Date" },
  { id: "custom", label: "Custom" },
] as const;

function toYmd(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function presetRange(id: string): { from: Date; to: Date } | null {
  const today = endOfDay(new Date());
  if (id === "today") return { from: startOfDay(today), to: today };
  if (id === "7d") return { from: startOfDay(subDays(today, 6)), to: today };
  if (id === "30d") return { from: startOfDay(subDays(today, 29)), to: today };
  if (id === "qtd") return { from: startOfQuarter(today), to: today };
  return null;
}

export function AnalyticsDatePicker({
  categories,
  tiers,
  regions,
}: {
  categories: FilterOption[];
  tiers: FilterOption[];
  regions: FilterOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const from = searchParams.get("from") ?? toYmd(subDays(new Date(), 29));
  const to = searchParams.get("to") ?? toYmd(new Date());
  const category = searchParams.get("category") ?? "all";
  const tier = searchParams.get("tier") ?? "all";
  const region = searchParams.get("region") ?? "all";

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (!value || value === "all") next.delete(key);
        else next.set(key, value);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const range: DateRange = useMemo(
    () => ({ from: new Date(from), to: new Date(to) }),
    [from, to],
  );

  const applyPreset = (id: string) => {
    const r = presetRange(id);
    if (!r) return;
    setParams({ from: toYmd(r.from), to: toYmd(r.to) });
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Select
        value={category}
        onValueChange={(v) => setParams({ category: v ?? "all" })}
      >
        <SelectTrigger size="sm" className="min-w-40 border-border bg-background">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      <Select
        value={tier !== "all" ? tier : region !== "all" ? `region:${region}` : "all"}
        onValueChange={(v) => {
          const val = v ?? "all";
          if (val === "all") setParams({ tier: null, region: null });
          else if (val.startsWith("region:")) {
            setParams({ region: val.slice(7), tier: null });
          } else {
            setParams({ tier: val, region: null });
          }
        }}
      >
        <SelectTrigger size="sm" className="min-w-40 border-border bg-background">
          <SelectValue placeholder="Tier / Region" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">All tiers / regions</SelectItem>
            {tiers.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
            {regions.map((r) => (
              <SelectItem key={r.id} value={`region:${r.id}`}>
                Region · {r.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      <Popover>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "min-w-56 justify-start border-border font-normal",
                !from && "text-muted-foreground",
              )}
            />
          }
        >
          <CalendarIcon data-icon="inline-start" />
          {from && to
            ? `${format(new Date(from), "MMM d, yyyy")} – ${format(new Date(to), "MMM d, yyyy")}`
            : "Pick dates"}
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-0">
          <div className="flex flex-col gap-2 border-b border-border p-2 sm:flex-row">
            {PRESETS.map((p) => (
              <Button
                key={p.id}
                variant="ghost"
                size="sm"
                className="justify-start"
                onClick={() => applyPreset(p.id)}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <Calendar
            mode="range"
            numberOfMonths={2}
            defaultMonth={range.from}
            selected={range}
            onSelect={(next) => {
              if (!next?.from) return;
              setParams({
                from: toYmd(next.from),
                to: toYmd(next.to ?? next.from),
              });
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
