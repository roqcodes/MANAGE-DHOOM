/** Mirrors invoice-level COGS gap / backfill idempotency rules (SQL backfill RPCs). */

export type CogsGapClassification =
  | "already_correct"
  | "would_backfill"
  | "manual_review_over_posted"
  | "manual_review_backfill_mismatch"
  | "skipped_no_revenue_journal";

const TOLERANCE = 0.01;

export function classifyInvoiceCogsGap(input: {
  expectedCogs: number;
  postedCogs: number;
  hasRevenueJournal: boolean;
  existingBackfillCogsDebit?: number | null;
}): { classification: CogsGapClassification; gap: number } {
  const gap = roundMoney(input.expectedCogs - input.postedCogs);

  if (!input.hasRevenueJournal && gap > TOLERANCE) {
    return { classification: "skipped_no_revenue_journal", gap };
  }

  if (gap < -TOLERANCE) {
    return { classification: "manual_review_over_posted", gap };
  }

  if (gap <= TOLERANCE) {
    return { classification: "already_correct", gap };
  }

  const backfill = input.existingBackfillCogsDebit;
  if (backfill != null && Math.abs(backfill - gap) > 0.02) {
    return { classification: "manual_review_backfill_mismatch", gap };
  }

  if (backfill != null && Math.abs(backfill - gap) <= 0.02) {
    return { classification: "already_correct", gap };
  }

  return { classification: "would_backfill", gap };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
