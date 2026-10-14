import {
  addDays,
  endOfQuarter,
  format,
  parseISO,
  setQuarter,
  setYear,
  startOfQuarter,
} from "date-fns";

export type VatCalendarQuarter = 1 | 2 | 3 | 4;

export type VatPeriodPresetId = `q${VatCalendarQuarter}_${number}` | "from_last_filed";

export const VAT_QUARTER_MONTH_LABELS: Record<VatCalendarQuarter, string[]> = {
  1: ["Jan", "Feb", "Mar"],
  2: ["Apr", "May", "Jun"],
  3: ["Jul", "Aug", "Sep"],
  4: ["Oct", "Nov", "Dec"],
};

export function vatQuarterPresetId(year: number, quarter: VatCalendarQuarter): VatPeriodPresetId {
  return `q${quarter}_${year}`;
}

export function parseVatQuarterPresetId(
  id: VatPeriodPresetId,
): { year: number; quarter: VatCalendarQuarter } | null {
  if (id === "from_last_filed") return null;
  const match = /^q([1-4])_(\d{4})$/.exec(id);
  if (!match) return null;
  return {
    quarter: Number(match[1]) as VatCalendarQuarter,
    year: Number(match[2]),
  };
}

/** Years shown in the VAT modal (current + prior). */
export function vatPresetYears(reference = new Date()): number[] {
  const y = reference.getFullYear();
  return [y, y - 1];
}

export const VAT_FROM_LAST_FILED_PRESET = {
  id: "from_last_filed" as const,
  label: "From last filed",
  requiresLastFiled: true,
};

export function toVatDateInput(value: Date) {
  return format(value, "yyyy-MM-dd");
}

export function resolveVatCalendarQuarter(year: number, quarter: VatCalendarQuarter) {
  const anchor = setQuarter(setYear(new Date(), year), quarter);
  return {
    start: toVatDateInput(startOfQuarter(anchor)),
    end: toVatDateInput(endOfQuarter(anchor)),
  };
}

export function resolveVatPeriodPreset(
  id: VatPeriodPresetId,
  lastFiledPeriodEnd?: string | null,
): { start: string; end: string } | null {
  if (id === "from_last_filed") {
    if (!lastFiledPeriodEnd) return null;
    const today = new Date();
    const nextStart = addDays(parseISO(lastFiledPeriodEnd), 1);
    if (nextStart > today) return null;
    return {
      start: toVatDateInput(nextStart),
      end: toVatDateInput(today),
    };
  }

  const parsed = parseVatQuarterPresetId(id);
  if (!parsed) return null;
  return resolveVatCalendarQuarter(parsed.year, parsed.quarter);
}
