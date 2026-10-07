"use client";

import type { OrderStatus } from "@/common/admin/types";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { cn } from "@/lib/utils";

/** Semantic accent tokens aligned with product detail / admin theme — no raw blue-* utilities. */
export const ORDERS_ACCENT = {
  link: "text-primary hover:text-primary/80",
  selectedRow: "data-[state=selected]:bg-accent/60",
  selectionBar: "border-border bg-accent/50",
  focus: "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
} as const;

/** @deprecated Use ORDERS_ACCENT or Button variants instead */
export const ORDERS_BRAND = ORDERS_ACCENT;

export type OrdersViewFilter =
  | "all"
  | "unfulfilled"
  | "unpaid"
  | "open"
  | "archived"
  | "return_requests";

export const ORDERS_VIEW_FILTERS: { id: OrdersViewFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unfulfilled", label: "Unfulfilled" },
  { id: "unpaid", label: "Unpaid" },
  { id: "open", label: "Open" },
  { id: "archived", label: "Archived" },
  { id: "return_requests", label: "Return requests" },
];

export function formatInr(n: number) {
  return formatCurrencyAmount(n);
}

export function shortOrderRef(id: string) {
  const segment = id.split("-")[0]?.toUpperCase() ?? id.slice(0, 8);
  return segment.slice(0, 4);
}

export function isPaid(paymentStatus: string | null) {
  return paymentStatus === "paid";
}

export function isRefunded(paymentStatus: string | null) {
  return paymentStatus === "refunded";
}

export function isPaymentNotRequired(paymentStatus: string | null) {
  return paymentStatus === "not_required";
}

export function paymentStatusLabel(paymentStatus: string | null) {
  if (isRefunded(paymentStatus)) return "Refunded";
  if (isPaid(paymentStatus)) return "Paid";
  if (isPaymentNotRequired(paymentStatus)) return "No payment";
  return "Unpaid";
}

export function isCancelled(status: string) {
  return status === "cancelled";
}

export const ORDER_FULFILLMENT_FLOW: OrderStatus[] = [
  "pending",
  "processing",
  "shipped",
  "delivered",
];

export function getNextFulfillmentStatus(
  status: string,
): OrderStatus | null {
  if (isCancelled(status) || status === "delivered") return null;
  const idx = ORDER_FULFILLMENT_FLOW.indexOf(status as OrderStatus);
  if (idx === -1 || idx >= ORDER_FULFILLMENT_FLOW.length - 1) return null;
  return ORDER_FULFILLMENT_FLOW[idx + 1];
}

export function fulfillmentActionLabel(status: string): string | null {
  const next = getNextFulfillmentStatus(status);
  if (!next) return null;
  switch (next) {
    case "processing":
      return "Confirm order";
    case "shipped":
      return "Mark as shipped";
    case "delivered":
      return "Mark as delivered";
    default:
      return null;
  }
}

export function isFulfilled(status: string) {
  return status === "delivered" || status === "shipped";
}

export function matchesViewFilter(
  order: {
    status: OrderStatus | string;
    payment_status: string | null;
  },
  filter: OrdersViewFilter,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "unfulfilled":
      return order.status === "pending" || order.status === "processing";
    case "unpaid":
      return (
        !isPaid(order.payment_status) &&
        !isPaymentNotRequired(order.payment_status)
      );
    case "open":
      return (
        order.status === "pending" ||
        order.status === "processing" ||
        order.status === "shipped"
      );
    case "archived":
      return order.status === "delivered" || order.status === "cancelled";
    case "return_requests":
      return order.status === "cancelled";
    default:
      return true;
  }
}

const INVENTORY_FULFILLMENT_LABELS: Record<string, string> = {
  none: "No inventory",
  pending_assignment: "Needs store",
  reserved: "Reserved",
  multi_shipment: "Multi-shipment",
  partially_shipped: "Partial ship",
  shipped: "Stock shipped",
  cancelled: "Released",
};

export function inventoryFulfillmentLabel(status: string | null | undefined) {
  if (!status || status === "none") return null;
  return INVENTORY_FULFILLMENT_LABELS[status] ?? status.replace(/_/g, " ");
}

export function InventoryFulfillmentStatusPill({
  status,
}: {
  status: string | null | undefined;
}) {
  const label = inventoryFulfillmentLabel(status);
  if (!label) return null;

  const tone =
    status === "pending_assignment"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : status === "reserved" || status === "multi_shipment"
        ? "border-sky-200 bg-sky-50 text-sky-800"
        : status === "partially_shipped"
          ? "border-violet-200 bg-violet-50 text-violet-800"
          : status === "shipped"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-border bg-muted text-muted-foreground";

  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize",
        tone,
      )}
    >
      {label}
    </span>
  );
}

export function FulfillmentPill({ status }: { status: string }) {
  const fulfilled = isFulfilled(status);
  const cancelled = status === "cancelled";

  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize",
        fulfilled
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : cancelled
            ? "border-border bg-muted text-muted-foreground"
            : "border-amber-200 bg-amber-50 text-amber-800",
      )}
    >
      {fulfilled ? "Fulfilled" : status === "pending" ? "Unfulfilled" : status}
    </span>
  );
}

function sparkPoints(seed: number, count = 12): number[] {
  const points: number[] = [];
  let value = 0.35 + (seed % 7) * 0.04;
  for (let i = 0; i < count; i++) {
    const wave = Math.sin((i + seed) * 0.75) * 0.12;
    const drift = ((seed + i * 3) % 5) * 0.015;
    value = Math.min(0.95, Math.max(0.08, value + wave + drift - 0.04));
    points.push(value);
  }
  return points;
}

export function MiniSparkline({
  seed,
  tone = "primary",
  flat = false,
  className,
}: {
  seed: number;
  tone?: "primary" | "neutral" | "green";
  flat?: boolean;
  className?: string;
}) {
  const width = 72;
  const height = 28;
  const values = flat
    ? Array.from({ length: 12 }, () => 0.5)
    : sparkPoints(seed);
  const step = width / (values.length - 1);

  const linePath = values
    .map((v, i) => {
      const x = i * step;
      const y = height - v * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

  const toneClass =
    tone === "green"
      ? "text-emerald-600"
      : tone === "neutral"
        ? "text-muted-foreground"
        : "text-primary";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("h-7 w-[4.5rem] shrink-0", toneClass, className)}
      aria-hidden
    >
      <path d={areaPath} fill="currentColor" fillOpacity={0.12} />
      <path
        d={linePath}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity={0.85}
      />
    </svg>
  );
}

export function TrendBadge({
  value,
  tone = "up",
}: {
  value: string;
  tone?: "up" | "down" | "neutral";
}) {
  const styles = {
    up: "border-emerald-200 bg-emerald-50 text-emerald-700",
    down: "border-rose-200 bg-rose-50 text-rose-700",
    neutral: "border-border bg-muted text-muted-foreground",
  } as const;

  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums",
        styles[tone],
      )}
    >
      {value}
    </span>
  );
}

export function PaymentPill({
  paymentStatus,
}: {
  paymentStatus: string | null;
}) {
  const paid = isPaid(paymentStatus);
  const refunded = isRefunded(paymentStatus);
  const notRequired = isPaymentNotRequired(paymentStatus);

  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
        refunded
          ? "bg-rose-50 text-rose-700"
          : paid
            ? "bg-emerald-50 text-emerald-700"
            : notRequired
              ? "bg-sky-50 text-sky-700"
              : "bg-muted text-muted-foreground",
      )}
    >
      {paymentStatusLabel(paymentStatus)}
    </span>
  );
}

export function CustomerEditedPill() {
  return (
    <span
      className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-800"
    >
      Edited
    </span>
  );
}

export function CustomerEditLineBadge({
  flag,
}: {
  flag: string | null | undefined;
}) {
  if (flag !== "added" && flag !== "modified") return null;

  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        flag === "added"
          ? "bg-violet-100 text-violet-800"
          : "bg-amber-100 text-amber-900",
      )}
    >
      {flag === "added" ? "New" : "Edited"}
    </span>
  );
}

export function isCustomerEditedOrder(
  customerEditedAt: string | null | undefined,
): boolean {
  return Boolean(customerEditedAt);
}

export {
  formatAddressLine,
  normalizeOrderAddress,
} from "@/modules/orders/lib/order-address";

export function customerInitials(name: string | null | undefined) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}
