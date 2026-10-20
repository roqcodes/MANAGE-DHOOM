import { formatCurrencyAmount } from "@/lib/format-currency";

const MONEY_EPS = 0.009;

export type PaymentDocumentKind = "invoice" | "bill";

export function moneyExceeds(amount: number, balanceDue: number): boolean {
  return amount > balanceDue + MONEY_EPS;
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
  if (allocatedTotal <= MONEY_EPS) {
    return `No open ${plural} to apply this payment to.`;
  }
  return `The payment ${formatCurrencyAmount(requestedAmount)} is more than the total open balance of ${formatCurrencyAmount(allocatedTotal)} across open ${plural}.`;
}

export function sumPaymentAmounts(lines: { amount: number }[]): number {
  return lines.reduce((sum, line) => sum + line.amount, 0);
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
