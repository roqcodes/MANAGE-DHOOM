-- Phase 2 inventory shadow reconciler — integration checks (run after 20261026240000).
-- Use a staging / disposable database. Replace placeholders before running.

-- NOT RUN AUTOMATICALLY. Does not mutate SPI, ledger, or journals when using read-only RPCs only.

-- ─── Placeholders ───────────────────────────QD────────────────────────────────
-- \set authorized_store_id 'eed2fe05-36a9-492f-9bde-34d5023e2226'
-- \set other_store_id     '<uuid-of-store-staff-cannot-access>'

-- ─── 1. Service role: store reconcile (no auth.uid) ─────────────────────────
-- Run with service_role key in SQL editor or supabase db execute.
/*
SELECT public.erp_inventory_shadow_reconcile(
  'eed2fe05-36a9-492f-9bde-34d5023e2226'::uuid,
  CURRENT_DATE
) -> 'reconciliation_eligible' AS eligible;
*/

-- ─── 2. Staff authorized store (via authenticated JWT in app / invoke script) ─
-- Expect: success, reconciliation_eligible true when all movement costs resolve.

-- ─── 3. Staff unauthorized store ─────────────────────────────────────────────
-- Expect: ERROR from require_store_access (message varies).

-- ─── 4. Cross-store product RPC ─────────────────────────────────────────────
/*
SELECT public.erp_shadow_project_product_inventory(
  '<other_store_id>'::uuid,
  '<any_product_id>'::uuid,
  now()
);
-- Expect: forbidden for staff without membership on other_store_id
*/

-- ─── 5. Empty persisted ledger ───────────────────────────────────────────────
/*
SELECT (public.erp_inventory_shadow_reconcile(
  'eed2fe05-36a9-492f-9bde-34d5023e2226'::uuid, CURRENT_DATE
) -> 'persisted_ledger' ->> 'latest_value_sum')::numeric AS ledger_sum;
-- Expect: 0 before Phase 3 posting
*/

-- ─── 6. Idempotent reconcile ─────────────────────────────────────────────────
/*
WITH a AS (
  SELECT public.erp_inventory_shadow_reconcile(
    'eed2fe05-36a9-492f-9bde-34d5023e2226'::uuid, CURRENT_DATE
  ) j
), b AS (
  SELECT public.erp_inventory_shadow_reconcile(
    'eed2fe05-36a9-492f-9bde-34d5023e2226'::uuid, CURRENT_DATE
  ) j
)
SELECT (SELECT j FROM a) = (SELECT j FROM b) AS identical;
*/

-- ─── 7. No mutation guard (run as two statements in one session) ─────────────
/*
SELECT COUNT(*) AS spi_rows_before FROM public.store_product_inventory
WHERE store_id = 'eed2fe05-36a9-492f-9bde-34d5023e2226';

SELECT public.erp_inventory_shadow_reconcile(
  'eed2fe05-36a9-492f-9bde-34d5023e2226'::uuid, CURRENT_DATE
);

SELECT COUNT(*) AS spi_rows_after FROM public.store_product_inventory
WHERE store_id = 'eed2fe05-36a9-492f-9bde-34d5023e2226';
-- Expect: spi_rows_before = spi_rows_after

SELECT COUNT(*) AS ledger_rows FROM public.erp_inventory_cost_ledger;
-- Expect: unchanged after reconcile-only
*/

-- ─── 8. Ledger snapshot order (after Phase 3 has rows — design verification) ─
/*
-- Insert test rows in disposable DB only; latest as-of must follow posted_at, seq, id.
SELECT public.erp_inventory_ledger_store_value_as_of(
  '<store>'::uuid, now()
);
*/

-- ─── 9. Incomplete product fixture (disposable DB only) ─────────────────────
/*
-- Insert stock_movement receipt with NULL resolvable cost, then:
SELECT public.erp_shadow_project_product_inventory_core(
  '<store>'::uuid, '<product>'::uuid, now()
) -> 'reconciliation_eligible';
-- Expect: false
*/
