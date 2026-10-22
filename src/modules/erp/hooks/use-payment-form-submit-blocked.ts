"use client";

import { useMemo } from "react";

import { parsePaymentAmount } from "@/lib/decimal-precision";
import {
  validatePaymentLinesBalance,
  validateSingleDocumentPaymentAmount,
  type PaymentDocumentKind,
} from "@/modules/erp/lib/payment-balance-validation";

export type PaymentFormLineBalance = {
  amount: number;
  balanceDue: number;
  label?: string;
};

export type PaymentFormSubmitBlockInput = {
  inlineError: string | null;
  lineAmount: string;
  documentKind: PaymentDocumentKind;
  selectedDocumentId?: string;
  selectedDocumentBalance?: number;
  selectedDocumentLabel?: string;
  lines?: PaymentFormLineBalance[];
};

function currentAmountFieldIssue(input: PaymentFormSubmitBlockInput): string | null {
  if (!input.selectedDocumentId) return null;
  const amt = parsePaymentAmount(input.lineAmount);
  return validateSingleDocumentPaymentAmount(
    amt,
    input.selectedDocumentBalance ?? 0,
    input.documentKind,
    input.selectedDocumentLabel,
  );
}

/** True when Record/Save must stay disabled (inline error, bad lines, or amount over balance). */
export function usePaymentFormSubmitBlocked(input: PaymentFormSubmitBlockInput): boolean {
  return useMemo(() => {
    if (input.inlineError) return true;

    if (input.lines && input.lines.length > 0) {
      const lineErr = validatePaymentLinesBalance(input.lines, input.documentKind);
      if (lineErr) return true;
    }

    const fieldErr = currentAmountFieldIssue(input);
    if (fieldErr) return true;

    return false;
  }, [
    input.inlineError,
    input.lineAmount,
    input.documentKind,
    input.selectedDocumentId,
    input.selectedDocumentBalance,
    input.selectedDocumentLabel,
    input.lines,
  ]);
}

/** True when Add invoice/bill / Apply FIFO should stay disabled for the current amount field. */
export function usePaymentFormAddLineBlocked(input: PaymentFormSubmitBlockInput): boolean {
  return useMemo(() => {
    if (input.inlineError) return true;
    const fieldErr = currentAmountFieldIssue(input);
    return Boolean(fieldErr);
  }, [
    input.inlineError,
    input.lineAmount,
    input.documentKind,
    input.selectedDocumentId,
    input.selectedDocumentBalance,
    input.selectedDocumentLabel,
  ]);
}
