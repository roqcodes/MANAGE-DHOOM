"use client";

import { BANKING_TRANSACTION_TYPES } from "@/common/erp/finance-types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function formatBankingType(
  type: string,
  amounts?: { debit_amount?: number; credit_amount?: number },
) {
  if (type === "generic" && amounts) {
    const credit = Number(amounts.credit_amount ?? 0);
    const debit = Number(amounts.debit_amount ?? 0);
    if (credit > 0 && debit <= 0) return "Other payment";
    if (debit > 0) return "Other income";
  }
  return (
    BANKING_TRANSACTION_TYPES[type as keyof typeof BANKING_TRANSACTION_TYPES] ??
    type.replace(/_/g, " ")
  );
}

export function AccountTypeBadge({
  typeName,
  category,
}: {
  typeName: string;
  category: string;
}) {
  const isLoan = category === "Liability" || /loan/i.test(typeName);
  return (
    <Badge
      variant="outline"
      className={cn(
        isLoan
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-amber-200 bg-amber-50 text-amber-800",
      )}
    >
      {isLoan ? `Loan (${category})` : typeName}
    </Badge>
  );
}

export function BalanceBadge({ amount }: { amount: number }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums",
        amount < 0
          ? "bg-slate-900 text-white"
          : "bg-primary/10 text-primary",
      )}
    >
      {amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
}

/** Cash account header: money-in actions (theme primary). */
export const bankingTxToolbarInButtonClass = cn(
  "shrink-0 border border-primary/15 bg-primary/[0.08] text-foreground shadow-none",
  "hover:border-primary/30 hover:bg-primary/[0.13]",
  "[&_svg]:text-primary",
);

/** Cash account header: money-out actions (neutral secondary). */
export const bankingTxToolbarOutButtonClass = cn(
  "shrink-0 border border-border/80 bg-card text-foreground shadow-none",
  "hover:border-border hover:bg-secondary/50",
  "[&_svg]:text-secondary-foreground",
);

export function bankingTxModalAccentClass(accent: "in" | "out" | "neutral") {
  return cn(
    "flex size-9 shrink-0 items-center justify-center rounded-lg",
    accent === "in" && "bg-primary/12 text-primary ring-1 ring-primary/15",
    accent === "out" && "bg-secondary/80 text-secondary-foreground ring-1 ring-border/80",
    accent === "neutral" && "bg-accent text-accent-foreground ring-1 ring-border/60",
  );
}

/** Left pane of split banking modals (money in vs out). */
export function bankingTxModalAsideClass(accent: "in" | "out" | "neutral") {
  return cn(
    "flex flex-col border-border px-4 md:w-[min(100%,300px)] md:shrink-0 md:border-r",
    "border-b bg-gradient-to-b from-muted/45 to-muted/15 md:border-b-0",
    accent === "in" && "md:border-l-[3px] md:border-l-primary",
    accent === "out" && "md:border-l-[3px] md:border-l-muted-foreground/45",
    accent === "neutral" && "md:border-l-[3px] md:border-l-border",
  );
}
