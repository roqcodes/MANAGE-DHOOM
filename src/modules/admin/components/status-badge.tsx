import type { OrderStatus } from "@/common/admin/types";
import { cn } from "@/lib/utils";

type StatusStyle = {
  bg: string;
  text: string;
  dot: string;
  border: string;
};

/** PO / misc statuses not in customer order pipeline */
const EXTRA_STATUS_STYLES: Record<string, StatusStyle> = {
  accepted: {
    border: "border-blue-200",
    bg: "bg-blue-50",
    text: "text-blue-800",
    dot: "bg-blue-500",
  },
  active: {
    border: "border-emerald-200",
    bg: "bg-emerald-50",
    text: "text-emerald-800",
    dot: "bg-emerald-500",
  },
  paused: {
    border: "border-slate-200",
    bg: "bg-slate-100",
    text: "text-slate-700",
    dot: "bg-slate-400",
  },
  unpaid: {
    border: "border-amber-200",
    bg: "bg-amber-50",
    text: "text-amber-800",
    dot: "bg-amber-500",
  },
  draft: {
    border: "border-slate-300",
    bg: "bg-slate-200",
    text: "text-slate-900",
    dot: "bg-slate-600",
  },
  sent: {
    border: "border-sky-200",
    bg: "bg-sky-50",
    text: "text-sky-800",
    dot: "bg-sky-500",
  },
  issued: {
    border: "border-blue-200",
    bg: "bg-blue-50",
    text: "text-blue-800",
    dot: "bg-blue-500",
  },
  converted: {
    border: "border-violet-200",
    bg: "bg-violet-50",
    text: "text-violet-800",
    dot: "bg-violet-500",
  },
  finalized: {
    border: "border-emerald-200",
    bg: "bg-emerald-50",
    text: "text-emerald-800",
    dot: "bg-emerald-500",
  },
  partially_received: {
    border: "border-violet-200",
    bg: "bg-violet-50",
    text: "text-violet-800",
    dot: "bg-violet-500",
  },
  fully_received: {
    border: "border-emerald-200",
    bg: "bg-emerald-50",
    text: "text-emerald-800",
    dot: "bg-emerald-500",
  },
  reversed: {
    border: "border-slate-200",
    bg: "bg-slate-100",
    text: "text-slate-600",
    dot: "bg-slate-400",
  },
  completed: {
    border: "border-emerald-200",
    bg: "bg-emerald-50",
    text: "text-emerald-800",
    dot: "bg-emerald-500",
  },
  approved: {
    border: "border-blue-200",
    bg: "bg-blue-50",
    text: "text-blue-800",
    dot: "bg-blue-500",
  },
  submitted: {
    border: "border-amber-200",
    bg: "bg-amber-50",
    text: "text-amber-800",
    dot: "bg-amber-500",
  },
  applied: {
    border: "border-purple-200",
    bg: "bg-purple-50",
    text: "text-purple-800",
    dot: "bg-purple-500",
  },
  partial: {
    border: "border-amber-200",
    bg: "bg-amber-50",
    text: "text-amber-800",
    dot: "bg-amber-500",
  },
  paid: {
    border: "border-emerald-200",
    bg: "bg-emerald-50",
    text: "text-emerald-800",
    dot: "bg-emerald-500",
  },
  overdue: {
    border: "border-rose-200",
    bg: "bg-rose-50",
    text: "text-rose-700",
    dot: "bg-rose-500",
  },
  allocated: {
    border: "border-sky-200",
    bg: "bg-sky-50",
    text: "text-sky-800",
    dot: "bg-sky-500",
  },
  pending_approval: {
    border: "border-amber-200",
    bg: "bg-amber-50",
    text: "text-amber-800",
    dot: "bg-amber-500",
  },
  rejected: {
    border: "border-rose-200",
    bg: "bg-rose-50",
    text: "text-rose-700",
    dot: "bg-rose-500",
  },
};

const STATUS_STYLES: Record<OrderStatus, StatusStyle> = {
  pending: {
    border: "border-amber-200",
    bg: "bg-amber-50",
    text: "text-amber-800",
    dot: "bg-amber-500",
  },
  processing: {
    border: "border-blue-200",
    bg: "bg-blue-50",
    text: "text-blue-800",
    dot: "bg-blue-500",
  },
  shipped: {
    border: "border-violet-200",
    bg: "bg-violet-50",
    text: "text-violet-800",
    dot: "bg-violet-500",
  },
  delivered: {
    border: "border-emerald-200",
    bg: "bg-emerald-50",
    text: "text-emerald-800",
    dot: "bg-emerald-500",
  },
  cancelled: {
    border: "border-rose-200",
    bg: "bg-rose-50",
    text: "text-rose-700",
    dot: "bg-rose-500",
  },
};

const STATUS_LABELS: Record<string, string> = {
  partially_received: "Partially received",
  fully_received: "Fully received",
  pending_approval: "Pending approval",
  not_required: "No payment",
};

export function formatStatusLabel(status: string): string {
  const key = status.trim().toLowerCase();
  if (STATUS_LABELS[key]) return STATUS_LABELS[key];
  return key.replace(/_/g, " ");
}

function resolveStatusStyle(status: string): StatusStyle {
  const key = status.trim().toLowerCase();
  return (
    STATUS_STYLES[key as OrderStatus] ??
    EXTRA_STATUS_STYLES[key] ?? {
      border: "border-border",
      bg: "bg-muted",
      text: "text-muted-foreground",
      dot: "bg-muted-foreground",
    }
  );
}

export function StatusBadge({ status }: { status: string }) {
  const style = resolveStatusStyle(status);
  const label = formatStatusLabel(status);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize tracking-wide",
        style.border,
        style.bg,
        style.text,
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", style.dot)} aria-hidden />
      {label}
    </span>
  );
}
