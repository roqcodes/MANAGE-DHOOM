import {
  endOfMonth,
  endOfQuarter,
  format,
  isEqual,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
} from "date-fns";

export type AdminDatePreset =
  | "all"
  | "today"
  | "yesterday"
  | "last_7"
  | "last_30"
  | "last_90"
  | "this_week"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "qtd"
  | "ytd"
  | "custom";

export type AdminDateRangeValue = {
  preset: AdminDatePreset;
  from: string;
  to: string;
};

export type AdminDatePresetOption = {
  id: AdminDatePreset;
  label: string;
};

export const ADMIN_DATE_PRESET_OPTIONS: AdminDatePresetOption[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last_7", label: "Last 7 days" },
  { id: "last_30", label: "Last 30 days" },
  { id: "last_90", label: "Last 90 days" },
  { id: "this_week", label: "This week" },
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "this_quarter", label: "This quarter" },
  { id: "qtd", label: "Quarter to date" },
  { id: "ytd", label: "Year to date" },
  { id: "all", label: "All dates" },
  { id: "custom", label: "Custom range" },
];

const WEEK_STARTS_ON = 1;

export function toYmd(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function adminDatePresetRange(
  preset: AdminDatePreset,
): { from: string; to: string } | null {
  if (preset === "all" || preset === "custom") return null;

  const now = new Date();
  const today = toYmd(now);

  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const y = subDays(now, 1);
      const ymd = toYmd(y);
      return { from: ymd, to: ymd };
    }
    case "last_7":
      return { from: toYmd(subDays(now, 7)), to: today };
    case "last_30":
      return { from: toYmd(subDays(now, 30)), to: today };
    case "last_90":
      return { from: toYmd(subDays(now, 90)), to: today };
    case "this_week":
      return {
        from: toYmd(startOfWeek(now, { weekStartsOn: WEEK_STARTS_ON })),
        to: today,
      };
    case "this_month":
      return { from: toYmd(startOfMonth(now)), to: today };
    case "last_month": {
      const start = startOfMonth(subMonths(now, 1));
      return { from: toYmd(start), to: toYmd(endOfMonth(start)) };
    }
    case "this_quarter": {
      const start = startOfQuarter(now);
      return { from: toYmd(start), to: toYmd(endOfQuarter(now)) };
    }
    case "qtd":
      return { from: toYmd(startOfQuarter(now)), to: today };
    case "ytd":
      return { from: toYmd(startOfYear(now)), to: today };
    default:
      return null;
  }
}

export function adminDatePresetLabel(preset: AdminDatePreset): string {
  return (
    ADMIN_DATE_PRESET_OPTIONS.find((o) => o.id === preset)?.label ?? "Custom range"
  );
}

export function adminDateRangeButtonLabel(value: AdminDateRangeValue): string {
  if (value.preset === "all") return "All dates";
  if (value.preset !== "custom") return adminDatePresetLabel(value.preset);
  if (value.from && value.to) {
    const from = new Date(`${value.from}T00:00:00`);
    const to = new Date(`${value.to}T00:00:00`);
    return `${format(from, "MMM d, yyyy")} – ${format(to, "MMM d, yyyy")}`;
  }
  return "Custom range";
}

function sameYmd(a: string, b: string): boolean {
  if (!a || !b) return a === b;
  return isEqual(startOfDay(new Date(`${a}T00:00:00`)), startOfDay(new Date(`${b}T00:00:00`)));
}

export function detectAdminDatePreset(from: string, to: string): AdminDatePreset {
  if (!from && !to) return "all";
  const presets = ADMIN_DATE_PRESET_OPTIONS.map((o) => o.id).filter(
    (id) => id !== "all" && id !== "custom",
  ) as AdminDatePreset[];
  for (const preset of presets) {
    const range = adminDatePresetRange(preset);
    if (range && sameYmd(range.from, from) && sameYmd(range.to, to)) return preset;
  }
  return "custom";
}

export function applyAdminDatePreset(preset: AdminDatePreset): AdminDateRangeValue {
  const range = adminDatePresetRange(preset);
  if (!range) return { preset, from: "", to: "" };
  return { preset, from: range.from, to: range.to };
}

export function adminDateRangeIsActive(value: AdminDateRangeValue): boolean {
  return value.preset !== "all" || Boolean(value.from || value.to);
}

/** Map legacy list period query values to unified presets. */
export function legacyPeriodToAdminDateRange(period: string): AdminDateRangeValue {
  if (!period || period === "all") return applyAdminDatePreset("all");
  if (period === "today") return applyAdminDatePreset("today");
  if (period === "7") return applyAdminDatePreset("last_7");
  if (period === "30") return applyAdminDatePreset("last_30");
  if (period === "this_month") return applyAdminDatePreset("this_month");
  if (period === "this_quarter" || period === "qtd") return applyAdminDatePreset("this_quarter");
  if (period === "previous_month") return applyAdminDatePreset("last_month");
  return { preset: "custom", from: "", to: "" };
}
