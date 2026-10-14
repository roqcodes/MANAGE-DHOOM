"use client";

import { formatCurrencyAmount } from "@/lib/format-currency";
import { cn } from "@/lib/utils";

export function StatementSectionHeader({ title }: { title: string }) {
  return (
    <tr className="border-b bg-muted/40">
      <td colSpan={2} className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-primary">
        {title}
      </td>
    </tr>
  );
}

export function StatementSubsectionHeader({ title }: { title: string }) {
  return (
    <tr>
      <td colSpan={2} className="px-4 py-2 text-xs font-medium italic text-muted-foreground">
        {title}
      </td>
    </tr>
  );
}

export function StatementLineRow({
  label,
  amount,
  indent = false,
}: {
  label: string;
  amount: number;
  indent?: boolean;
}) {
  return (
    <tr className="border-b border-border/50 transition-colors hover:bg-muted/20">
      <td className={cn("px-4 py-2.5 text-sm", indent && "pl-8")}>{label}</td>
      <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">
        {formatCurrencyAmount(amount)}
      </td>
    </tr>
  );
}

export function StatementTotalRow({
  label,
  amount,
  emphasis = false,
}: {
  label: string;
  amount: number;
  emphasis?: boolean;
}) {
  return (
    <tr className="border-y bg-muted/50">
      <td className={cn("px-4 py-3 text-sm font-medium", emphasis && "text-base")}>{label}</td>
      <td
        className={cn(
          "px-4 py-3 text-right tabular-nums font-semibold",
          emphasis && "text-base",
          amount < 0 && "text-destructive",
        )}
      >
        {formatCurrencyAmount(amount)}
      </td>
    </tr>
  );
}

export function StatementTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[320px] border-collapse text-sm">
        <thead>
          <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3 text-left font-medium">Account</th>
            <th className="px-4 py-3 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
