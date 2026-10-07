# BuyHub production certification — SQL runbook

Run in **Supabase SQL Editor** (or `psql`) against the target project **after** all hardening migrations are applied.

## Migration apply order (Phases 1–7)

Apply in timestamp order under `supabase/migrations/`, including at minimum:

1. `20261002120000_phase1_rls_authorization_hardening.sql`
2. `20261002140000_phase2_pos_checkout_atomic.sql`
3. `20261002150000_ensure_walk_in_customer_self_heal.sql`
4. `20261002160000_fix_pos_order_fulfillment_status.sql`
5. `20261002170000_phase3_purchase_finalize_separation.sql`
6. `20261002180000_phase4_transfers_payments_returns.sql`
7. `20261002190000_phase5_query_performance.sql`
8. `20261002200000_phase6_pos_nonblocking.sql`
9. `20261002210000_fix_ensure_walk_in_customer_pgcrypto.sql`
10. `20261002220000_pos_header_total_integrity.sql`
11. `20261002230000_order_items_allow_multiple_lines_per_variant.sql`

Earlier baseline migrations must already be applied on the project.

## Scripts (each uses `ROLLBACK` unless noted)

| Order | Script | Focus |
|-------|--------|--------|
| 1 | `run-rls-security-tests.sql` | RLS / cross-store |
| 2 | `run-pos-checkout-tests.sql` | POS atomic checkout |
| 3 | `run-phase6-pos-checkout-tests.sql` | POS idempotent replay |
| 3b | `run-pos-header-total-integrity-tests.sql` | W4 POS header totals |
| 4 | `run-purchase-finalize-tests.sql` | Receive vs bill separation |
| 5 | `run-phase4-integrity-tests.sql` | Transfers / payments smoke |
| 6 | `run-phase5-performance-tests.sql` | Batch RPC smoke |
| 7 | `run-integration-tests.sql` | Legacy integration smoke |

Record pass/fail and any `TEST_SKIP` notices (missing fixture data).

## Application validation (local)

From `bh-manage/`:

```bash
npx tsc --noEmit
npm run build
npm run lint   # known pre-existing backlog; not a runtime blocker
```

No load testing is required for certification.
