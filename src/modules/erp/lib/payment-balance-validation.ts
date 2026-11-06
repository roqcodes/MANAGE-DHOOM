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
    return `No open ${plural} or opening balance to apply this payment to.`;
  }
  return `The payment ${formatCurrencyAmount(requestedAmount)} is more than the total open balance of ${formatCurrencyAmount(allocatedTotal)} (open ${plural} + opening).`;
}

export function sumPaymentAmounts(lines: { amount: number }[]): number {
  const sum = lines.reduce((acc, line) => acc + Number(line.amount), 0);
  return quantizePaymentAmount(sum);
}

export const UNALLOCATED_LINE_PREFIX = "unallocated:";

export function unallocatedLineId(partyId: string): string {
  return `${UNALLOCATED_LINE_PREFIX}${partyId}`;
}

export function isUnallocatedLineId(id: string | null | undefined): boolean {
  return Boolean(id?.startsWith(UNALLOCATED_LINE_PREFIX));
}

/** Cash left after FIFO to open documents — recorded as unallocated (opening / advance). */
export function fifoRemainderAmount(
  requestedAmount: number,
  allocatedLines: { amount: number }[],
): number {
  const remainder =
    quantizePaymentAmount(requestedAmount) - sumPaymentAmounts(allocatedLines);
  return remainder > PAYMENT_BALANCE_TOLERANCE ? quantizePaymentAmount(remainder) : 0;
}

/**
 * Opening leftover FIFO may use: never more than unpaid opening, never more than
 * net outstanding after open documents. Credit / overpaid parties get 0.
 */
export function remainingOpeningDueFromBalances(input: {
  openingBalance: number;
  unallocatedPayments: number;
  netOutstanding: number;
  openDocumentBalances: number;
}): number {
  const openingLeftover = quantizePaymentAmount(
    Math.max(0, Number(input.openingBalance) - Number(input.unallocatedPayments)),
  );
  const netAfterDocs = quantizePaymentAmount(
    Number(input.netOutstanding) - Number(input.openDocumentBalances),
  );
  return quantizePaymentAmount(Math.max(0, Math.min(openingLeftover, netAfterDocs)));
}

/**
 * FIFO may apply leftover cash only up to remaining opening due (not unlimited advance).
 * `alreadyReservedOpening` is opening already queued on the form for this party.
 */
export function resolveFifoOpeningRemainder(
  requestedAmount: number,
  allocatedLines: { amount: number }[],
  remainingOpeningDue: number,
  alreadyReservedOpening = 0,
  documentKind: PaymentDocumentKind = "invoice",
): { ok: true; openingAmount: number } | { ok: false; message: string } {
  if (!Number.isFinite(requestedAmount) || requestedAmount <= PAYMENT_BALANCE_TOLERANCE) {
    return { ok: false, message: "Enter a positive amount." };
  }
  const docs = sumPaymentAmounts(allocatedLines);
  const openingCap = quantizePaymentAmount(
    Math.max(
      0,
      (Number.isFinite(remainingOpeningDue) ? remainingOpeningDue : 0) -
        (Number.isFinite(alreadyReservedOpening) ? alreadyReservedOpening : 0),
    ),
  );
  const maxTotal = quantizePaymentAmount(docs + openingCap);
  if (moneyExceeds(requestedAmount, maxTotal)) {
    return {
      ok: false,
      message: fifoPaymentExceedsOpenBalanceMessage(requestedAmount, maxTotal, documentKind),
    };
  }
  const remainder = fifoRemainderAmount(requestedAmount, allocatedLines);
  const openingAmount = quantizePaymentAmount(Math.min(remainder, openingCap));
  if (docs + openingAmount <= PAYMENT_BALANCE_TOLERANCE) {
    return {
      ok: false,
      message: fifoPaymentExceedsOpenBalanceMessage(requestedAmount, 0, documentKind),
    };
  }
  return { ok: true, openingAmount };
}

/** Matches RPC: charges of 0 are always ok; otherwise charges must be strictly less than cash. */
export function bankChargesWithinPaymentTotal(
  bankCharges: number,
  paymentTotal: number,
): boolean {
  if (!Number.isFinite(bankCharges) || bankCharges <= 0) return true;
  if (!Number.isFinite(paymentTotal) || paymentTotal <= 0) return false;
  return bankCharges < paymentTotal;
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
