# Historical sale COGS GL backfill

## What migration `20261020160000` did **not** do

- **No automatic repair** of historical invoices.
- `erp_audit_missing_sale_cogs_gl` is **detect-only** (lists `cogs_gap` > 0).
- Future sales get COGS via `post_journal_for_invoice` and deferred COGS on receipt allocation.

## What migration `20261020170000` adds

| RPC | Purpose |
|-----|---------|
| `erp_audit_sale_cogs_gl_summary(date_from, date_to, store_id)` | Counts: correct, missing backfill, uncosted-only, no revenue journal, over-posted. |
| `erp_backfill_sale_cogs_gl(..., p_dry_run, ...)` | Dry-run or apply supplemental journals. |
| `erp_post_invoice_cogs_backfill(invoice_id, actor, dry_run)` | One idempotent `invoice_cogs_backfill` journal per invoice (DR COGS / CR STOCK). |
| `erp_post_credit_note_cogs_backfill(...)` | Supplemental CN COGS/stock reversal if missing. |

**Cost basis:** Same as live posting — `erp_invoice_item_margin_components` / store WAC / line `base_price`. Lines with full `pending_cost_qty` are **not** included in expected COGS (uncosted until receipt resolution).

**Does not:** Assume zero cost, repost revenue journals, or use today’s price as historical cost.

## Staging procedure (manual approval required)

```sql
-- 1) Before
SELECT public.erp_audit_sale_cogs_gl_summary('2024-01-01', CURRENT_DATE, NULL);

SELECT public.erp_audit_missing_sale_cogs_gl('2024-01-01', CURRENT_DATE, NULL, 1000);

-- 2) Dry-run
SELECT public.erp_backfill_sale_cogs_gl(
  '2024-01-01', CURRENT_DATE, NULL, 5000, true, true, auth.uid()
);

-- 3) Apply (after finance sign-off)
SELECT public.erp_backfill_sale_cogs_gl(
  '2024-01-01', CURRENT_DATE, NULL, 5000, false, true, auth.uid()
);

-- 4) After
SELECT public.erp_audit_sale_cogs_gl_summary('2024-01-01', CURRENT_DATE, NULL);

-- 5) Idempotency check (should post 0, would_post 0)
SELECT public.erp_backfill_sale_cogs_gl(
  '2024-01-01', CURRENT_DATE, NULL, 5000, false, true, auth.uid()
);
```

Reconcile P&L, trial balance (STOCK + COGS), and `erp_audit_missing_sale_cogs_gl` (should be `[]` for reconstructable sales).

## Manual review buckets

- `over_posted_manual_review` — posted COGS > margin-recognized COGS.
- `backfill_amount_mismatch` — backfill journal exists but gap changed.
- `no_posted_revenue_journal` — fix revenue posting before COGS backfill.
- `uncosted_pending` lines — wait for receipt / pending-cost allocation, not backfill at zero cost.
