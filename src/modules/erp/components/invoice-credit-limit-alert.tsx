"use client";

import Link from "next/link";

import type { InvoiceCreditExceededDetails } from "@/common/erp/invoice-credit-messages";
import { formatCurrencyAmount } from "@/lib/format-currency";

export function InvoiceCreditLimitExceededAlert({
  customerId,
  details,
}: {
  customerId: string;
  details: InvoiceCreditExceededDetails;
}) {
  return (
    <div
      className="rounded-lg border border-destructive/35 bg-destructive/[0.06] px-3 py-3 text-sm text-foreground"
      role="alert"
    >
      <p className="font-semibold text-destructive">Credit limit exceeded</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        This invoice can&apos;t be saved until the total fits the customer&apos;s available credit.
      </p>

      <dl className="mt-3 space-y-1.5 text-xs">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">Credit limit</dt>
          <dd className="tabular-nums font-medium">{formatCurrencyAmount(details.creditLimit)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">Already owed</dt>
          <dd className="tabular-nums font-medium">{formatCurrencyAmount(details.alreadyOwed)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">Available credit</dt>
          <dd className="tabular-nums font-medium">{formatCurrencyAmount(details.available)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t border-border/60 pt-1.5">
          <dt className="text-muted-foreground">This invoice</dt>
          <dd className="tabular-nums font-semibold">{formatCurrencyAmount(details.invoiceTotal)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="font-medium text-destructive">Over by</dt>
          <dd className="tabular-nums font-semibold text-destructive">
            {formatCurrencyAmount(details.overBy)}
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-xs text-muted-foreground">
        Lower line items or discount on this invoice, or{" "}
        <Link
          href={`/admin/customers?form=edit&id=${encodeURIComponent(customerId)}`}
          className="font-medium text-primary underline underline-offset-2 hover:no-underline"
        >
          raise the customer&apos;s credit limit
        </Link>
        .
      </p>
    </div>
  );
}
