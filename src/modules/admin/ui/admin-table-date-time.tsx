"use client";

import {
  erpActivityTimestamp,
  formatListDateLabel,
  formatTimeLocal,
  type ErpListActivityTimestamps,
} from "@/lib/format-date";
import { cn } from "@/lib/utils";

export type AdminTableDateTimeProps = {
  className?: string;
  /** Business date (YYYY-MM-DD), e.g. purchase_date or payment_date. */
  documentDate?: string | null;
  /** Row timestamps for activity time when documentDate is date-only. */
  activity?: ErpListActivityTimestamps | null;
  /** Full timestamp column (e.g. created_at on invoices). */
  at?: string | null;
};

export function AdminTableDateTime({
  className,
  documentDate,
  activity,
  at,
}: AdminTableDateTimeProps) {
  const instant = at ?? erpActivityTimestamp(activity);
  const dateSource = at ?? documentDate;
  const dateLabel = formatListDateLabel(dateSource);
  const timeLabel = formatTimeLocal(instant);

  return (
    <div className={cn("tabular-nums", className)}>
      <span>{dateLabel}</span>
      {timeLabel ? (
        <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
          {timeLabel}
        </span>
      ) : null}
    </div>
  );
}
