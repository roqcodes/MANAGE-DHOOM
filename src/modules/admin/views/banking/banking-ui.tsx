"use client";

import { BANKING_TRANSACTION_TYPES } from "@/common/erp/finance-types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function formatBankingType(type: string) {
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
