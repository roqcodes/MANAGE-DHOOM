"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

import type { VatReturnListRow } from "@/common/erp/finance-types";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function BreakdownRow({
  label,
  value,
  emphasis,
  muted,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-[11px]">
      <span className={cn("text-muted-foreground", muted && "text-muted-foreground/80")}>
        {label}
      </span>
      <span
        className={cn(
          "shrink-0 tabular-nums",
          emphasis ? "font-semibold text-foreground" : "font-medium text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function PopoverShell({
  label,
  title,
  subtitle,
  children,
}: {
  label: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col overflow-hidden">
      <div className="border-b border-border/60 bg-muted/25 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 text-[13px] font-semibold leading-snug text-foreground">{title}</p>
        {subtitle ? (
          <p className="mt-0.5 text-[10px] font-medium text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5 px-3 py-2">{children}</div>
    </div>
  );
}

export function VatReturnTaxPopover({ row }: { row: VatReturnListRow }) {
  const recoverable = Math.max(0, row.input_tax - row.output_tax);
  const hasActivity = row.output_tax > 0 || row.input_tax > 0;
  const brief = hasActivity
    ? `Out ${formatCurrencyAmount(row.output_tax)} · In ${formatCurrencyAmount(row.input_tax)}`
    : "No tax in period";

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              "inline-flex max-w-full flex-col items-end gap-0.5 text-right",
              "rounded-sm text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            )}
          />
        }
      >
        <span className="inline-flex items-center gap-1 tabular-nums font-semibold">
          {formatCurrencyAmount(row.total_tax_payable)}
          <ChevronDown className="size-3.5 shrink-0 opacity-50" aria-hidden />
        </span>
        <span className="max-w-[9rem] truncate text-[10px] font-medium text-muted-foreground">
          {brief}
        </span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[17.5rem] gap-0 p-0">
        <PopoverShell
          label="VAT breakdown"
          title={formatCurrencyAmount(row.total_tax_payable)}
          subtitle={`${row.period_label} · ${row.store_name ?? "All stores"}`}
        >
          <BreakdownRow label="Output tax (sales)" value={formatCurrencyAmount(row.output_tax)} />
          <BreakdownRow label="Input tax (purchases)" value={formatCurrencyAmount(row.input_tax)} />
          <div className="my-0.5 border-t border-border/60" />
          <BreakdownRow
            label="Tax payable"
            value={formatCurrencyAmount(row.total_tax_payable)}
            emphasis
          />
          {recoverable > 0 ? (
            <BreakdownRow
              label="Recoverable credit"
              value={formatCurrencyAmount(recoverable)}
              muted
            />
          ) : null}
          {row.balance_due > 0 ? (
            <BreakdownRow
              label="Balance due"
              value={formatCurrencyAmount(row.balance_due)}
              emphasis
            />
          ) : null}
          <p className="pt-1 text-[10px] leading-relaxed text-muted-foreground">
            Payable is output minus input, floored at zero.
          </p>
          <Link
            href={`/admin/erp/vat-returns/${row.id}`}
            className="mt-1 inline-flex text-[11px] font-semibold text-primary hover:underline"
          >
            View tax details →
          </Link>
        </PopoverShell>
      </PopoverContent>
    </Popover>
  );
}
