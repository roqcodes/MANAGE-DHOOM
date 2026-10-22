import { formatCurrencyAmount } from "@/lib/format-currency";
import {
  PAYMENT_DECIMAL_PLACES,
  quantizePaymentAmount,
} from "@/lib/decimal-precision";

/** Float wiggle at payment precision (half of smallest 3dp unit). */
export const PAYMENT_BALANCE_TOLERANCE = 10 ** -PAYMENT_DECIMAL_PLACES / 2;

export type PaymentDocumentKind = "invoice" | "bill";

export function paymentAmountExceedsBalance(amount: number, balanceDue: number): boolean {
  if (!Number.isFinite(amount) || !Number.isFinite(balanceDue)) return false;
  const a = quantizePaymentAmount(amount);
  const b = quantizePaymentAmount(balanceDue);
  return a > b + PAYMENT_BALANCE_TOLERANCE;
}

/** Cap to open balance when within tolerance; preserve 3dp (no 4dp roundMoney). */
export function normalizePaymentAllocationAmount(amount: number, balanceDue: number): number {
  const amountN = Number(amount);
  const balanceN = Number(balanceDue);
  if (paymentAmountExceedsBalance(amountN, balanceN)) {
    return quantizePaymentAmount(amountN);
  }
  const applied = amountN <= balanceN ? amountN : balanceN;
  return quantizePaymentAmount(applied);
}

export function moneyExceeds(amount: number, balanceDue: number): boolean {
  return paymentAmountExceedsBalance(amount, balanceDue);
}

export function paymentExceedsDocumentBalanceMessage(
  amount: number,
  balanceDue: number,
  documentKind: PaymentDocumentKind,
  documentLabel?: string,
): string {
  const name = documentKind === "invoice" ? "invoice" : "bill";
  const suffix = documentLabel ? ` (${documentLabel})` : "";
  return `The amount ${formatCurrencyAmount(amount)} is more than the ${name} balance of ${formatCurrencyAmount(balanceDue)}${suffix}. Enter ${formatCurrencyAmount(balanceDue)} or less.`;
}

export function fifoPaymentExceedsOpenBalanceMessage(
  requestedAmount: number,
  allocatedTotal: number,
  documentKind: PaymentDocumentKind,
): string {
  const plural = documentKind === "invoice" ? "invoices" : "bills";
  if (allocatedTotal <= PAYMENT_BALANCE_TOLERANCE) {
    return `No open ${plural} to apply this payment to.`;
  }
  return `The payment ${formatCurrencyAmount(requestedAmount)} is more than the total open balance of ${formatCurrencyAmount(allocatedTotal)} across open ${plural}.`;
}

export function sumPaymentAmounts(lines: { amount: number }[]): number {
  const sum = lines.reduce((acc, line) => acc + Number(line.amount), 0);
  return quantizePaymentAmount(sum);
}

export function validatePaymentLinesBalance(
  lines: { amount: number; balanceDue: number; label?: string }[],
  documentKind: PaymentDocumentKind,
): string | null {
  for (const line of lines) {
    if (moneyExceeds(line.amount, line.balanceDue)) {
      return paymentExceedsDocumentBalanceMessage(
        line.amount,
        line.balanceDue,
        documentKind,
        line.label,
      );
    }
  }
  return null;
}

export function validateFifoAllocationAmount(
  requestedAmount: number,
  allocatedLines: { amount: number }[],
  documentKind: PaymentDocumentKind,
): string | null {
  const allocated = sumPaymentAmounts(allocatedLines);
  if (moneyExceeds(requestedAmount, allocated)) {
    return fifoPaymentExceedsOpenBalanceMessage(requestedAmount, allocated, documentKind);
  }
  return null;
}

export function validateSingleDocumentPaymentAmount(
  amount: number,
  balanceDue: number,
  documentKind: PaymentDocumentKind,
  documentLabel?: string,
): string | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (moneyExceeds(amount, balanceDue)) {
    return paymentExceedsDocumentBalanceMessage(
      amount,
      balanceDue,
      documentKind,
      documentLabel,
    );
  }
  return null;
}

export function validateTransferAllocationAmount(
  amount: number,
  balanceDue: number,
  transferLabel?: string,
): string | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (moneyExceeds(amount, balanceDue)) {
    const suffix = transferLabel ? ` for transfer ${transferLabel}` : "";
    return `The amount ${formatCurrencyAmount(amount)} exceeds the balance due of ${formatCurrencyAmount(balanceDue)}${suffix}.`;
  }
  return null;
}

export function validateVatPaymentAmount(amount: number, balanceDue: number): string | null {
  if (!Number.isFinite(amount) || amount === 0) return null;
  if (moneyExceeds(amount, balanceDue)) {
    return `The payment ${formatCurrencyAmount(amount)} is more than the VAT return balance of ${formatCurrencyAmount(balanceDue)}.`;
  }
  return null;
}
