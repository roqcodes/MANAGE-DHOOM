/** Business calendar: Asia/Dubai (GST/VAT ops). */

export type PeriodKey =
  | "today"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_year"
  | "custom";
 
function dubaiNowParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  return { year, month, day };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function ymd(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function lastDayOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function resolvePeriod(
  period?: PeriodKey | string | null,
  fromDate?: string | null,
  toDate?: string | null,
): { from: string; to: string; label: string } {
  if (fromDate && toDate) {
    return { from: fromDate.slice(0, 10), to: toDate.slice(0, 10), label: `${fromDate} → ${toDate}` };
  }

  const { year, month, day } = dubaiNowParts();
  const today = ymd(year, month, day);
  const key = (period || "this_month") as PeriodKey;

  if (key === "today") {
    return { from: today, to: today, label: "today" };
  }
  if (key === "this_year") {
    return { from: ymd(year, 1, 1), to: today, label: String(year) };
  }
  if (key === "last_month") {
    const lm = month === 1 ? 12 : month - 1;
    const ly = month === 1 ? year - 1 : year;
    return {
      from: ymd(ly, lm, 1),
      to: ymd(ly, lm, lastDayOfMonth(ly, lm)),  
      label: `${ly}-${pad(lm)}`,
    };  
  }
  if (key === "this_week") {
    const utc = Date.UTC(year, month - 1, day);
    const weekday = new Date(utc).getUTCDay() || 7;
    const start = new Date(utc);
    start.setUTCDate(start.getUTCDate() - (weekday - 1));
    return {
      from: start.toISOString().slice(0, 10),
      to: today,
      label: "this week",
    };
  }
  if (key === "last_week") {
    const utc = Date.UTC(year, month - 1, day);
    const weekday = new Date(utc).getUTCDay() || 7;
    const end = new Date(utc);
    end.setUTCDate(end.getUTCDate() - weekday);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 6);
    return {
      from: start.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
      label: "last week",
    };
  }

  return {
    from: ymd(year, month, 1),
    to: today,
    label: `${year}-${pad(month)}`,
  };
}
