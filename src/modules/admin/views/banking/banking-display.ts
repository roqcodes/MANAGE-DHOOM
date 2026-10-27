import { BANKING_TRANSACTION_TYPES } from "@/common/erp/finance-types";

export type BankingTypeDisplayRow = {
  debit_amount?: number;
  credit_amount?: number;
  details?: string | null;
};

/** Legacy mirror rows stored as generic with transfer journal line descriptions. */
const LEGACY_TRANSFER_DETAILS = new Set([
  "counter",
  "transfer in",
  "transfer out",
  "credit",
]);

export function isInterAccountTransferCashBookRow(
  transactionType: string,
  row: BankingTypeDisplayRow,
): boolean {
  if (transactionType === "account_transfer") return true;
  if (transactionType !== "generic") return false;

  const details = (row.details ?? "").trim().toLowerCase();
  if (!LEGACY_TRANSFER_DETAILS.has(details)) return false;

  const debit = Number(row.debit_amount ?? 0);
  const credit = Number(row.credit_amount ?? 0);
  return (debit > 0 && credit <= 0) || (credit > 0 && debit <= 0);
}

export function formatBankingType(
  type: string,
  row?: BankingTypeDisplayRow,
): string {
  if (row && isInterAccountTransferCashBookRow(type, row)) {
    return BANKING_TRANSACTION_TYPES.account_transfer;
  }

  if (type === "generic" && row) {
    const credit = Number(row.credit_amount ?? 0);
    const debit = Number(row.debit_amount ?? 0);
    if (credit > 0 && debit <= 0) return "Other payment";
    if (debit > 0) return "Other income";
  }

  return (
    BANKING_TRANSACTION_TYPES[type as keyof typeof BANKING_TRANSACTION_TYPES] ??
    type.replace(/_/g, " ")
  );
}

/** True when the row must not be treated as P&L income/expense in UI summaries. */
export function isNonPnlBankingRow(
  transactionType: string,
  row: BankingTypeDisplayRow,
): boolean {
  return isInterAccountTransferCashBookRow(transactionType, row);
}
