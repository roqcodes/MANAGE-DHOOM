"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import type { LucideIcon } from "lucide-react";
import {
  ClipboardList,
  CreditCard,
  FileText,
  History,
  Package,
  Receipt,
  RotateCcw,
  ShoppingCart,
  UserCircle,
} from "lucide-react";

import type { AuditLogEntry } from "@/common/erp/types";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import {
  auditLogEntityHref,
  formatAuditActivityTitle,
  formatAuditLogUser,
} from "@/modules/erp/lib/audit-log-display";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const ENTITY_ICONS: Record<string, LucideIcon> = {
  invoice: FileText,
  purchase_bill: Receipt,
  estimate: FileText,
  credit_note: RotateCcw,
  expense: Receipt,
  customer_payment: CreditCard,
  erp_payment: CreditCard,
  customer_payment_batch: CreditCard,
  supplier_payment: CreditCard,
  vendor_credit: RotateCcw,
  purchase_order: Package,
  order: ShoppingCart,
  sales_order: ClipboardList,
  product: Package,
  customer: UserCircle,
  vendor: UserCircle,
  journal_entry: FileText,
};

function activityIcon(entityType: string): LucideIcon {
  return ENTITY_ICONS[entityType] ?? History;
}

function ActivityItem({ log }: { log: AuditLogEntry }) {
  const Icon = activityIcon(log.entity_type);
  const href = auditLogEntityHref(log);
  const title = formatAuditActivityTitle(log);
  const when = formatDistanceToNow(new Date(log.created_at), { addSuffix: true });
  const by = formatAuditLogUser(log);

  const content = (
    <div className="flex gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-slate-50">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
        <Icon className="size-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug text-slate-900">{title}</p>
        {log.description ? (
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-500">
            {log.description}
          </p>
        ) : null}
        <p className="mt-1 text-[11px] text-slate-400">
          {by} · {when}
        </p>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
        {content}
      </Link>
    );
  }

  return content;
}

function RecentActivityEmptyState() {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="relative mb-4 flex size-20 items-center justify-center">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50" />
        <div className="relative flex size-14 items-center justify-center rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <History className="size-6 text-slate-400" aria-hidden />
        </div>
      </div>
      <p className="max-w-[220px] text-sm font-medium text-slate-700">
        Your recent activity will show up here
      </p>
      <p className="mt-1.5 max-w-[240px] text-xs leading-relaxed text-slate-500">
        Invoices, bills, payments, and other ERP actions appear as you work.
      </p>
    </div>
  );
}

export function AdminRecentActivityMenu() {
  const [open, setOpen] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: adminQueryKeys.recentActivity(),
    queryFn: () => adminGet<{ data: AuditLogEntry[] }>("erp/audit-logs?recent=1&limit=20"),
    staleTime: 30_000,
    enabled: open,
  });

  const entries = data?.data ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors",
          "hover:bg-slate-200/60 hover:text-slate-900",
          "data-popup-open:bg-slate-200/70 data-popup-open:text-slate-900",
        )}
        aria-label="Recent activity"
        title="Recent activity"
      >
        <History className="size-[18px]" aria-hidden />
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(22rem,calc(100vw-1.5rem))] gap-0 overflow-hidden p-0"
      >
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Recent activity
          </p>
        </div>

        <div className="max-h-[min(24rem,60vh)] overflow-y-auto overscroll-contain px-2 py-2">
          {isLoading ? (
            <div className="space-y-2 px-2 py-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="flex gap-3 py-2">
                  <div className="size-9 shrink-0 animate-pulse rounded-xl bg-slate-100" />
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-3 w-3/4 animate-pulse rounded bg-slate-100" />
                    <div className="h-2.5 w-1/2 animate-pulse rounded bg-slate-100" />
                  </div>
                </div>
              ))}
            </div>
          ) : isError ? (
            <p className="px-4 py-8 text-center text-sm text-rose-600">
              Could not load activity.
            </p>
          ) : entries.length === 0 ? (
            <RecentActivityEmptyState />
          ) : (
            <ul className="divide-y divide-slate-100">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <ActivityItem log={entry} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {entries.length > 0 ? (
          <div className="border-t border-slate-100 px-4 py-2.5">
            <Link
              href="/admin/erp/reports/activity-logs"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => setOpen(false)}
            >
              View full activity log
            </Link>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
