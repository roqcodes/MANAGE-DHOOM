import { addMonths, endOfMonth, format, parseISO, startOfMonth } from "date-fns";

export const UPCOMING_DELIVERY_MONTH_TAB_COUNT = 6;

export type PurchaseOrderDeliveryMonthFilter = "all" | "this" | string;

export function parsePurchaseOrderDeliveryMonth(
  raw: string | null | undefined,
): PurchaseOrderDeliveryMonthFilter {
  const value = raw?.trim();
  if (!value || value === "all") return "all";
  if (value === "this") return "this";
  if (/^\d{4}-\d{2}$/.test(value)) return value;
  return "all";
}

export function expectedDeliveryMonthRange(
  filter: Exclude<PurchaseOrderDeliveryMonthFilter, "all">,
  now = new Date(),
): { start: string; end: string } {
  const anchor =
    filter === "this"
      ? startOfMonth(now)
      : startOfMonth(parseISO(`${filter}-01`));
  return {
    start: format(anchor, "yyyy-MM-dd"),
    end: format(endOfMonth(anchor), "yyyy-MM-dd"),
  };
}

export function buildPurchaseOrderDeliveryMonthTabs(now = new Date()) {
  const tabs: { id: PurchaseOrderDeliveryMonthFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "this", label: "This month" },
  ];
  const currentYear = format(now, "yyyy");
  for (let i = 1; i <= UPCOMING_DELIVERY_MONTH_TAB_COUNT; i++) {
    const monthStart = startOfMonth(addMonths(now, i));
    const monthYear = format(monthStart, "yyyy");
    tabs.push({
      id: format(monthStart, "yyyy-MM"),
      label:
        monthYear !== currentYear
          ? format(monthStart, "MMMM yyyy")
          : format(monthStart, "MMMM"),
    });
  }
  return tabs;
}

export function deliveryMonthFilterLabel(
  filter: PurchaseOrderDeliveryMonthFilter,
): string | null {
  if (filter === "all") return null;
  if (filter === "this") return "This month";
  const tabs = buildPurchaseOrderDeliveryMonthTabs();
  return tabs.find((tab) => tab.id === filter)?.label ?? filter;
}