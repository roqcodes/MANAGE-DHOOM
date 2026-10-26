# Phase 2 — Inventory cost ledger (schema + shadow reconciler)

**Status:** For review. **Not enabled** for writes. No change to purchase/sales posting, SPI, or journals.

## Migration

`supabase/migrations/20261026240000_inventory_cost_ledger_shadow.sql`

## Schema: `erp_inventory_cost_ledger`

| Column | Purpose |
|--------|---------|
| `store_id`, `product_id` | Isolation per store |
| `seq` | Monotonic per `(store_id, product_id)` when posting is enabled |
| `movement_kind` | `receipt`, `issue`, `adjustment_*`, `transfer_*`, `opening_balance` |
| `source_document_type`, `source_document_id`, `source_line_id` | Traceability |
| `journal_entry_id` | Link to GL when posted |
| `qty_delta`, `unit_cost`, `value_delta` | Signed economics at posting snapshot |
| `qty_after`, `wac_after`, `inventory_value_after` | Running state after row |
| `posted_at` | Business event time |
| `recorded_at` | Insert time |
| `idempotency_key` | Unique when set (retry safety) |
| `policy_version` | Costing policy version (default `1`) |
| `metadata` | Extensibility |

**RLS:** Staff `SELECT` only. `INSERT/UPDATE/DELETE` revoked for `authenticated` until a dedicated `SECURITY DEFINER` writer RPC is approved (Phase 3).

## Read-only shadow reconciler

| RPC | Role |
|-----|------|
| `erp_shadow_project_product_inventory(store, product, as_of_ts)` | Replay `stock_movements` ≤ as_of with AVCO; issues use **WAC before issue** for shadow COGS |
| `erp_inventory_shadow_reconcile(store, as_of date)` | Store-level JSON: GL STOCK, SPI total, shadow subledger, empty persisted ledger, variances |

**Does not:** insert ledger rows, update SPI, post journals, or call purchase/sale posting.

**Unit cost on receipts:** `erp_resolve_stock_movement_unit_cost` (bill loaded unit, receive loaded, else `transaction_price`).

## Transaction boundaries (future posting — design only)

When ledger posting is enabled (Phase 3+), each economic event must run in **one database transaction**:

1. `SELECT … FOR UPDATE` on `store_product_inventory` for affected `(store_id, product_id)` rows (deterministic product order if multiple).
2. Compute `wac_before` / new WAC / `value_delta`.
3. `INSERT` into `erp_inventory_cost_ledger` with next `seq` (per product).
4. Update SPI cache (`stock`, `purchase_price`).
5. `log_product_stock_movement` (operational).
6. Create or link `journal_entry` lines (GL).

**Rollback:** any failure rolls back ledger + SPI + journal in the same transaction.

**Phase 2:** None of the above runs in production paths.

## Concurrency strategy

| Concern | Approach |
|---------|----------|
| Same SKU concurrent sales | Row-level lock on SPI via `FOR UPDATE` in posting RPC (future); serializes WAC read/issue per product |
| Same SKU receipt + sale | Lock order: always lock products in `uuid` order when multiple lines |
| Idempotency | Unique `idempotency_key` on ledger; posting RPC returns existing row on retry |
| `seq` gaps | Accept gaps on rollback; uniqueness on `(store_id, product_id, seq)` |
| Shadow reconciler | `STABLE`, read-only, no locks; safe concurrent reads |
| Backdated `posted_at` | Future writer must reject or flag if period closed; shadow uses `stock_movements.created_at` vs GL `transaction_date` (document mismatch risk) |

## Feature flag

`app_settings.inventory_ledger_v2_enabled` — default `false`. Shadow RPC reports flag value; **no behavior change** until Phase 3 sets flag and ships writer.

## Deployment steps

1. Review this doc + migration SQL.
2. `supabase db push` (additive only).
3. Run shadow reconcile on Store A (staff or service_role):

   ```sql
   SELECT public.erp_inventory_shadow_reconcile(
     'eed2fe05-36a9-492f-9bde-34d5023e2226'::uuid,
     CURRENT_DATE
   );
   ```

4. Compare `gl_minus_shadow`, `gl_minus_spi`, `persisted_ledger.row_count_products` (expect **0**).
5. Do **not** set `inventory_ledger_v2_enabled = true` until Phase 3 writer is reviewed.

## Test plan (before enabling posting)

### SQL / integration (after migration)

| Case | Expect |
|------|--------|
| Empty ledger | `persisted_ledger.latest_value_sum = 0` |
| Store A shadow | `shadow_subledger.value` ≈ 1440; `gl_minus_shadow` ≈ 110 |
| Idempotent RPC | Two calls same params → identical JSON |
| Service role | `erp_inventory_shadow_reconcile` without `auth.uid()` |
| No SPI mutation | SPI before/after reconcile unchanged |

### Phase 3 gate (not in Phase 2)

- Purchase with discount + landed → ledger value = STOCK debit policy
- Partial sale → issue `unit_cost` = WAC before issue
- Concurrent sale simulation (two transactions)
- Retry same `idempotency_key`

## Reversibility

- Drop functions + table in a down migration if needed; no existing table altered except `app_settings` column add.
- Removing `inventory_ledger_v2_enabled` column is optional rollback.

## Unresolved risks

- Shadow uses movement `created_at`; GL uses `transaction_date` — may diverge for backdated journals.
- SPI “as-of” not stored; report labels SPI as current snapshot.
- Bill discount not yet in shadow receipt unit (policy Phase 3).
