"use client";

import { cn } from "@/lib/utils";
import { format, isPast, isToday, parseISO, startOfDay } from "date-fns";

import type {
  PurchaseOrderDeliveryFilter,
  PurchaseOrderStatusFilter,
} from "@/common/admin/types";
import {
  PURCHASE_ORDER_DELIVERY_FILTERS,
  PURCHASE_ORDER_STATUS_FILTERS,
} from "@/common/admin/types";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { INTERACTIVE_PRIMARY_LINK_CLASS } from "@/lib/ui/interactive-styles";
import {
  buildPurchaseOrderDeliveryMonthTabs,
  parsePurchaseOrderDeliveryMonth,
  type PurchaseOrderDeliveryMonthFilter,
} from "@/modules/purchase-orders/lib/delivery-month-filter";

export {
  buildPurchaseOrderDeliveryMonthTabs,
  parsePurchaseOrderDeliveryMonth,
  type PurchaseOrderDeliveryMonthFilter,
} from "@/modules/purchase-orders/lib/delivery-month-filter";

export const PO_ACCENT = {
  link: INTERACTIVE_PRIMARY_LINK_CLASS,
  selectedRow: "data-[state=selected]:bg-accent/60",
  selectionBar: "border-border bg-accent/50",
  focus: "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
} as const;

export const PURCHASE_ORDER_STATUS_FILTER_OPTIONS: {
  id: PurchaseOrderStatusFilter;
  label: string;
}[] = [
  { id: "all", label: "All statuses" },
  { id: "pending", label: "Pending" },
  { id: "production", label: "Production" },
  { id: "by_sea", label: "By Sea" },
  { id: "by_air", label: "By Air" },
  { id: "in_customs", label: "In Customs" },
  { id: "received", label: "Received" },
  { id: "accepted", label: "Accepted" },
  { id: "delivered", label: "Delivered" },
  { id: "cancelled", label: "Cancelled" },
  { id: "fully_received", label: "Fully Received" },
];

export const PURCHASE_ORDER_DELIVERY_FILTER_OPTIONS: {
  id: PurchaseOrderDeliveryFilter | "all";
  label: string;
}[] = [
  { id: "all", label: "All deliveries" },
  { id: "upcoming", label: "Upcoming" },
  { id: "due_this_week", label: "Due this week" },
  { id: "overdue", label: "Overdue" },
  { id: "awaiting_receipt", label: "Awaiting receipt" },
];

export function formatInr(n: number) {
  return formatCurrencyAmount(n);
}

export { shortPoRef } from "@/lib/erp-document-ref";

export function parsePurchaseOrderStatusFilter(
  raw: string | null | undefined,
): PurchaseOrderStatusFilter {
  const value = raw?.trim();
  if (
    value &&
    (PURCHASE_ORDER_STATUS_FILTERS as readonly string[]).includes(value)
  ) {
    return value as PurchaseOrderStatusFilter;
  }
  return "all";
}

export function parsePurchaseOrderDeliveryFilter(
  raw: string | null | undefined,
): PurchaseOrderDeliveryFilter | null {
  const value = raw?.trim();
  if (
    value &&
    (PURCHASE_ORDER_DELIVERY_FILTERS as readonly string[]).includes(value)
  ) {
    return value as PurchaseOrderDeliveryFilter;
  }
  return null;
}

export function buildPurchaseOrdersListParams(options: {
  status?: PurchaseOrderStatusFilter;
  deliveryMonth?: PurchaseOrderDeliveryMonthFilter;
  vendorId?: string | null;
  page?: number;
  includeStats?: boolean;
  statsOnly?: boolean;
}): URLSearchParams {
  const params = new URLSearchParams();
  if (options.status && options.status !== "all") {
    params.set("status", options.status);
  }
  if (options.deliveryMonth && options.deliveryMonth !== "all") {
    params.set("deliveryMonth", options.deliveryMonth);
  }
  if (options.vendorId) {
    params.set("vendorId", options.vendorId);
  }
  if (options.page && options.page > 0) {
    params.set("page", String(options.page));
  }
  if (options.statsOnly) {
    params.set("statsOnly", "1");
  } else if (options.includeStats === false) {
    params.set("includeStats", "false");
  }
  return params;
}

export type ExpectedDeliveryTone = "none" | "today" | "upcoming" | "overdue";

export function getExpectedDeliveryTone(
  dateStr: string | null | undefined,
): ExpectedDeliveryTone {
  if (!dateStr) return "none";
  const date = startOfDay(parseISO(dateStr));
  if (isToday(date)) return "today";
  if (isPast(date)) return "overdue";
  return "upcoming";
}

export function ExpectedDeliveryDate({
  dateStr,
  className,
}: {
  dateStr: string | null | undefined;
  className?: string;
}) {
  if (!dateStr) {
    return <span className={cn("text-[13px] text-muted-foreground", className)}>—</span>;
  }

  const tone = getExpectedDeliveryTone(dateStr);
  const label = format(parseISO(dateStr), "MMM d, yyyy");

  return (
    <span
      className={cn(
        "text-[13px] tabular-nums",
        tone === "overdue" && "font-medium text-rose-700",
        tone === "today" && "font-medium text-amber-800",
        tone === "upcoming" && "text-foreground",
        tone === "none" && "text-muted-foreground",
        className,
      )}
    >
      {label}
      {tone === "overdue" ? (
        <span className="ml-1.5 text-[11px] font-normal text-rose-600">Overdue</span>
      ) : null}
      {tone === "today" ? (
        <span className="ml-1.5 text-[11px] font-normal text-amber-700">Today</span>
      ) : null}
    </span>
  );
}

export function PoStatusPill({ status }: { status: string | null }) {
  const normalized = status ?? "unknown";

  const label =
    normalized === "pending" || normalized === "production"
      ? "Production"
      : normalized === "by_sea"
        ? "By Sea"
        : normalized === "by_air"
          ? "By Air"
          : normalized === "in_customs"
            ? "In Customs"
            : normalized === "fully_received"
              ? "Fully Received"
              : normalized === "partially_received"
                ? "Partially Received"
                : normalized.replace(/_/g, " ");

  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize",
        normalized === "production" || normalized === "pending"
          ? "border-indigo-200 bg-indigo-50 text-indigo-700"
          : normalized === "by_sea"
            ? "border-sky-200 bg-sky-50 text-sky-700"
            : normalized === "by_air"
              ? "border-violet-200 bg-violet-50 text-violet-700"
              : normalized === "in_customs"
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : normalized === "received"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : normalized === "delivered"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : normalized === "accepted"
                      ? "border-blue-200 bg-blue-50 text-blue-700"
                      : normalized === "cancelled"
                        ? "border-rose-200 bg-rose-50 text-rose-700"
                        : normalized === "pending"
                          ? "border-amber-200 bg-amber-50 text-amber-800"
                          : normalized === "partially_received"
                            ? "border-violet-200 bg-violet-50 text-violet-700"
                            : normalized === "fully_received"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                              : "border-border bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}
