import {
  addDays,
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subMonths,
} from "date-fns";

export type VatPeriodPresetId =
  | "this_month"
  | "last_month"
  | "quarter_to_date"
  | "year_to_date"
  | "from_last_filed";

export const VAT_PERIOD_PRESETS: Array<{
  id: VatPeriodPresetId;
  label: string;
  requiresLastFiled?: boolean;
}> = [
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "quarter_to_date", label: "Quarter to date" },
  { id: "year_to_date", label: "Year to date" },
  { id: "from_last_filed", label: "From last filed", requiresLastFiled: true },
];

export function toVatDateInput(value: Date) {
  return format(value, "yyyy-MM-dd");
}

export function resolveVatPeriodPreset(
  id: VatPeriodPresetId,
  lastFiledPeriodEnd?: string | null,
): { start: string; end: string } | null {
  const today = new Date();

  switch (id) {
    case "this_month":
      return {
        start: toVatDateInput(startOfMonth(today)),
        end: toVatDateInput(endOfMonth(today)),
      };
    case "last_month": {
      const previousMonth = subMonths(today, 1);
      return {
        start: toVatDateInput(startOfMonth(previousMonth)),
        end: toVatDateInput(endOfMonth(previousMonth)),
      };
    }
    case "quarter_to_date":
      return {
        start: toVatDateInput(startOfQuarter(today)),
        end: toVatDateInput(today),
      };
    case "year_to_date":
      return {
        start: toVatDateInput(startOfYear(today)),
        end: toVatDateInput(today),
      };
    case "from_last_filed": {
      if (!lastFiledPeriodEnd) return null;
      const nextStart = addDays(parseISO(lastFiledPeriodEnd), 1);
      if (nextStart > today) return null;
      return {
        start: toVatDateInput(nextStart),
        end: toVatDateInput(today),
      };
    }
    default:
      return null;
  }
}
