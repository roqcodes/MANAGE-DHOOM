import assert from "node:assert/strict";
import { test } from "node:test";

import { classifyInvoiceCogsGap } from "./cogs-backfill-idempotency";

test("zero gap is already correct", () => {
  const r = classifyInvoiceCogsGap({
    expectedCogs: 100,
    postedCogs: 100,
    hasRevenueJournal: true,
  });
  assert.equal(r.classification, "already_correct");
});

test("positive gap would backfill when revenue journal exists", () => {
  const r = classifyInvoiceCogsGap({
    expectedCogs: 100,
    postedCogs: 0,
    hasRevenueJournal: true,
  });
  assert.equal(r.classification, "would_backfill");
  assert.equal(r.gap, 100);
});

test("second run with matching backfill is already correct", () => {
  const r = classifyInvoiceCogsGap({
    expectedCogs: 100,
    postedCogs: 100,
    hasRevenueJournal: true,
    existingBackfillCogsDebit: 100,
  });
  assert.equal(r.classification, "already_correct");
});

test("over-posted requires manual review", () => {
  const r = classifyInvoiceCogsGap({
    expectedCogs: 50,
    postedCogs: 80,
    hasRevenueJournal: true,
  });
  assert.equal(r.classification, "manual_review_over_posted");
});
