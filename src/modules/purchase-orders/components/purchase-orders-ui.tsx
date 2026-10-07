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

export const PO_ACCENT = {
  link: "text-primary hover:text-primary/80",
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
  { id: "accepted", label: "Accepted" },
  { id: "delivered", label: "Delivered" },
  { id: "cancelled", label: "Cancelled" },
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
  delivery?: PurchaseOrderDeliveryFilter | null;
  vendorId?: string | null;
  page?: number;
}): URLSearchParams {
  const params = new URLSearchParams();
  if (options.status && options.status !== "all") {
    params.set("status", options.status);
  }
  if (options.delivery) {
    params.set("delivery", options.delivery);
  }
  if (options.vendorId) {
    params.set("vendorId", options.vendorId);
  }
  if (options.page && options.page > 0) {
    params.set("page", String(options.page));
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

  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize",
        normalized === "delivered"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : normalized === "accepted"
            ? "border-blue-200 bg-blue-50 text-blue-700"
            : normalized === "cancelled"
              ? "border-border bg-muted text-muted-foreground"
              : normalized === "pending"
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : normalized === "partially_received"
                  ? "border-violet-200 bg-violet-50 text-violet-700"
                  : normalized === "fully_received"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-border bg-muted text-muted-foreground",
      )}
    >
      {normalized.replace(/_/g, " ")}
    </span>
  );
}
