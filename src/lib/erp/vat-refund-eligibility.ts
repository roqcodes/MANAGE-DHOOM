import { PAYMENT_BALANCE_TOLERANCE, moneyExceeds } from "@/modules/erp/lib/payment-balance-validation";

export function vatRefundReceivedTotal(
  payments: { amount: number; entry_kind?: string }[],
): number {
  return payments
    .filter((p) => p.entry_kind === "tax_refund" || p.amount < 0)
    .reduce((sum, p) => sum + Math.abs(Number(p.amount ?? 0)), 0);
}

export function vatRefundRemaining(
  recoverableTax: number,
  refundReceivedTotal: number,
): number {
  return Math.max(0, recoverableTax - Math.max(0, refundReceivedTotal));
}

export function vatCarryForwardCredit(
  recoverableTax: number,
  refundReceivedTotal: number,
): number {
  return vatRefundRemaining(recoverableTax, refundReceivedTotal);
}

export function validateVatRefundAmount(
  amount: number,
  recoverableTax: number,
  refundReceivedTotal: number,
): string | null {
  if (!Number.isFinite(amount) || amount <= 0) {
    return "Refund amount must be greater than zero.";
  }
  if (recoverableTax <= PAYMENT_BALANCE_TOLERANCE) {
    return "This return has no recoverable VAT credit to refund.";
  }
  const remaining = vatRefundRemaining(recoverableTax, refundReceivedTotal);
  if (moneyExceeds(amount, remaining)) {
    return `Refund exceeds remaining refundable credit (${remaining.toFixed(2)} available).`;
  }
  return null;
}
