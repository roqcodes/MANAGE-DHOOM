import { roundMoney } from "@/common/erp/purchasing-types";
import { formatCurrencyAmount } from "@/lib/format-currency";

export type InvoiceCreditHeadroom = {
  hasLimit: boolean;
  creditLimit: number | null;
  outstanding: number;
  available: number | null;
};

export type InvoiceCreditExceededDetails = {
  creditLimit: number;
  alreadyOwed: number;
  available: number;
  invoiceTotal: number;
  overBy: number;
};

export function buildInvoiceCreditExceededDetails(
  headroom: InvoiceCreditHeadroom,
  invoiceTotal: number,
): InvoiceCreditExceededDetails | null {
  if (!headroom.hasLimit || headroom.creditLimit == null || headroom.available == null) {
    return null;
  }
  const creditLimit = roundMoney(headroom.creditLimit);
  const alreadyOwed = roundMoney(headroom.outstanding);
  const available = roundMoney(Math.max(headroom.available, 0));
  const total = roundMoney(invoiceTotal);
  const overBy = roundMoney(Math.max(0, alreadyOwed + total - creditLimit));
  return {
    creditLimit,
    alreadyOwed,
    available,
    invoiceTotal: total,
    overBy,
  };
}

/** Short message for API / save errors (no UI). */
export function formatInvoiceCreditExceededMessage(
  creditLimit: number,
  outstanding: number,
  available: number,
  invoiceTotal?: number,
): string {
  const avail = roundMoney(Math.max(available, 0));
  const limit = roundMoney(creditLimit);
  const owed = roundMoney(outstanding);

  if (invoiceTotal != null && invoiceTotal > 0) {
    const total = roundMoney(invoiceTotal);
    const overBy = roundMoney(Math.max(0, owed + total - limit));
    return (
      `This invoice (${formatCurrencyAmount(total)}) is ${formatCurrencyAmount(overBy)} over the customer's available credit (${formatCurrencyAmount(avail)} left of ${formatCurrencyAmount(limit)}). ` +
      `Reduce the invoice total or raise the credit limit on the customer record.`
    );
  }

  return (
    `No credit left for this customer (${formatCurrencyAmount(avail)} available of ${formatCurrencyAmount(limit)}; ` +
    `${formatCurrencyAmount(owed)} already owed). Reduce the invoice or update the credit limit.`
  );
}

export function invoiceTotalExceedsCreditHeadroom(
  invoiceTotal: number,
  headroom: InvoiceCreditHeadroom | null,
): boolean {
  if (!headroom?.hasLimit || headroom.creditLimit == null || headroom.available == null) {
    return false;
  }
  if (invoiceTotal <= 0) return false;
  return headroom.outstanding + invoiceTotal > headroom.creditLimit + 0.0001;
}
