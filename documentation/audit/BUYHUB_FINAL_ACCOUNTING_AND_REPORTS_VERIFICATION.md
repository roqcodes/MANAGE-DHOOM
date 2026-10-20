# BUYHUB ERP — Final Accounting Integrity & Reports Verification

**Verification date:** 2026-10-20  
**Scope:** DHOOM-MANAGE Reports module + GL COGS / pending-cost implementation  
**Prior audit:** `BUYHUB_REPORTS_ACCURACY_AND_COMMUNICATION_AUDIT.md`

---

## Verdict

### **INCOMPLETE — VERIFICATION BLOCKED (database E2E)**

Critical **code-level** fixes and regression tests are in place, and **production build + typecheck + unit tests pass**. However, **no disposable test database was available in this environment** to execute Scenarios A–G with journal/inventory assertions. Therefore **end-to-end accounting accuracy cannot be certified** until migrations are applied and `npm run erp:accounting:validate` (with `ACCOUNTING_INTEGRATION=1`) plus manual scenario scripts are run against staging.

---

## 1. Reports tested (status)

Legend: **Pass (code)** = implementation reviewed/fixed; **Pass (E2E)** = executed against DB with evidence; **Fail** = known defect; **N/R** = not re-run on DB.

| # | Report | Status | Notes |
|---|--------|--------|-------|
| 1 | Balance Sheet | **Pass (code)** | Section totals use full trial balance rows; search filters lines only (`balance-sheet-report.tsx`). E2E N/R. |
| 2 | Profit and Loss | **Pass (code)** | COGS section, gross profit, operating expenses (`get_erp_profit_and_loss` + UI). E2E N/R. |
| 3 | Cash Flow Statement | **Pass (code)** | Indirect method; starts from P&L `net_profit`; reconciles `net_change` vs cash balances. Not cash-receipt ledger. E2E N/R. |
| 4 | Day Book | **N/R** | Cash/bank lines; no change in this pass. |
| 5 | Finance Summary | **Pass (code)** | RPC + store path use `get_erp_financial_dashboard`; labels for COGS vs purchases (`finance-summary-report.tsx`). E2E N/R. |
| 6–7 | Daily/Monthly Collection | **N/R** | Payment-date based; not in COGS scope. |
| 8 | Sales by Customer | **Pass (code)** | Issue date; credit notes net ex-tax revenue & COGS (`20261020170000`). E2E N/R. |
| 9 | Sales by Item | **Pass (code)** | `net_sales_ex_tax` + incl-tax column; CN lines netted. E2E N/R. |
| 10 | Sales by Salesman | **Pass (code)** | CN profit uses subtotal − COGS, not tax-inclusive total. E2E N/R. |
| 11 | Credit Note Report | **N/R** | Dedicated listing; GL via `post_journal_for_credit_note`. |
| 12–16 | Inventory reports | **N/R** | Operational stock; reconcile to WAC separately. |
| 17–18 | Purchase by Item/Vendor | **N/R** | Purchases ≠ COGS (by design). |
| 19–27 | AR/AP aging & balances | **N/R** | Subledger; not re-tested E2E. |
| 28 | Trial Balance | **Pass (code)** | KPI totals from full `rows` / RPC meta, not search filter. |
| 29–30 | GL / Account Transactions | **N/R** | Source of truth for posted amounts. |
| 31–32 | VAT reports | **N/R** | Should align with posted tax lines post-CN fix. |
| 33–36 | Activity / drill-downs | **N/R** | |
| 37 | (Hub) | **Pass (code)** | Router unchanged. |

---

## 2. Accounting scenarios (expected vs actual)

| Scenario | Expected (summary) | Actual in this verification | Evidence |
|----------|-------------------|------------------------------|----------|
| **A** Normal purchase & sale | Rev 200, COGS 100, GP 100, stock 30@150 | **Not executed** | Requires seeded DB + receipt/sale RPCs |
| **B** WAC change | COGS at blended WAC | **Not executed** | `store_product_inventory_apply_receipt_cost` rounding in SQL |
| **C** Pending cost → receipt | No false profit; deferred COGS journal | **Not executed** | `erp_post_invoice_item_deferred_cogs` in `20261020160000` |
| **D** Credit notes | Rev/tax/COGS reversal; stock only if returned | **Not executed** | GL in `post_journal_for_credit_note`; stock restore is separate flag on create CN |
| **E** Idempotency | No duplicate journals | **Not executed** | `create_posted_journal_entry` idempotency by source entity |
| **F** Multi-store | Isolated stock/GL | **Not executed** | Store_id on journals + inventory |
| **G** Period boundaries | Consistent date basis | **Partial (code)** | Sales: `COALESCE(issued_at, created_at)`; GL: `transaction_date` |

---

## 3. Reconciliation matrix

| Check | Expected | Actual | Variance | Evidence |
|-------|----------|--------|----------|----------|
| Journal balance | debit = credit | — | — | `erp_audit_unbalanced_journals()` added; **not run on DB** |
| Trial balance | Σ debits = Σ credits | — | — | RPC returns `total_debit` / `total_credit`; UI fixed |
| Balance sheet | Assets = L + E | — | — | Same TB partition; E2E N/R |
| P&L gross profit | Income − COGS | Formula in RPC | — | Unit test `profit-and-loss-metrics.test.ts` |
| P&L net profit | Gross − opex | Formula in RPC | — | Same |
| Dashboard vs P&L | Same period KPIs | Assert in integration script | — | `validate-accounting-reports-integrity.ts` (skipped without env) |
| Missing sale COGS | gap = 0 for new sales | — | — | `erp_audit_missing_sale_cogs_gl` (historical may show gaps) |
| Cash flow vs cash GL | net_change ≈ ending − beginning | Indirect design | — | May not tie if non-cash working capital excluded |

---

## 4. Zoho Books benchmark (India)

| Area | Zoho expectation | BUYHUB | Classification |
|------|------------------|--------|----------------|
| P&L structure | Income → COGS → Gross → Expenses → Net | Implemented in RPC + UI | **Correctness (fixed)** |
| Finance dashboard COGS | Recognized COGS, not purchases | Fixed in `20261020160000` | **Correctness (fixed)** |
| Sales reports & CN | Net returns in sales analysis | Fixed in `20261020170000` | **Correctness (fixed)** |
| Cash flow | Direct or indirect with clear basis | Indirect from net income + WC | **Gap (documented)** — not Zoho direct method |
| Balance sheet layout | Dedicated BS | TB partition | **Enhancement** — acceptable if labeled |
| Credit note stock | Optional return to stock | `p_restore_stock` on create | **By design** — matches requirement |
| Multi-currency / GST returns | Full Zoho tax suite | Partial VAT RPCs | **Missing functionality** — out of scope |

---

## 5. Defects fixed (this verification pass)

| ID | Fix | Files / migrations |
|----|-----|-------------------|
| RPT-P0-001 | Purchases ≠ COGS on dashboard | `20261020160000`, `erp-finance-dashboard.service.ts` |
| RPT-P0-002 | Sale COGS + deferred COGS GL | `20261020160000` |
| RPT-P1-004 | BS totals on search | `balance-sheet-report.tsx` |
| RPT-P1-005 | Sales report dates | `20261020160000` |
| RPT-P1-006 | CN netting / salesman profit math | `20261020170000` |
| TB search totals | KPI from full rows | `trial-balance-report.tsx` |
| Finance Summary labels | COGS vs purchases | `finance-summary-report.tsx` |
| Typecheck vitest | `audit-entity-id.test.ts` → `node:test` | `src/lib/erp/audit-entity-id.test.ts` |

---

## 6. Regression tests & commands

| Command | Result |
|---------|--------|
| `npm run test:erp:unit` | **10 passed**, 0 failed |
| `npm run typecheck` | **Passed** |
| `npm run build` | **Passed** (exit 0, ~7.7 min) |
| `npm run lint` | Run locally if needed |
| `ACCOUNTING_INTEGRATION=1 npm run erp:accounting:validate` | **Skipped** (env not set) |

**New tests:** `profit-and-loss-metrics.test.ts`, `sales-report-credit-netting.test.ts`, updated `audit-entity-id.test.ts`.

**DB integration (optional):** `scripts/validate-accounting-reports-integrity.ts` — checks unbalanced journals, P&L math, dashboard ↔ P&L, logs COGS gap count.

---

## 7. Migration status (verified environment)

| Migration | Status in CI/agent env |
|-----------|-------------------------|
| `20261020140000_uncosted_sales_profit_reporting.sql` | Assumed prerequisite |
| `20261020160000_financial_reporting_cogs_accounting.sql` | **Not applied** (no DB access) |
| `20261020170000_sales_reports_credit_note_alignment.sql` | **Not applied** (no DB access) |

**Apply on test/staging:**

```bash
cd DHOOM-MANAGE
supabase db push   # or project migration mechanism
```

Then:

```bash
set ACCOUNTING_INTEGRATION=1
set NEXT_PUBLIC_SUPABASE_URL=...
set SUPABASE_SERVICE_ROLE_KEY=...
npm run erp:accounting:validate
```

---

## 8. Tests not run (reason)

| Test | Reason |
|------|--------|
| Scenarios A–G (full journal/inventory) | No disposable Postgres/Supabase in agent session |
| `erp:accounting:validate` | `ACCOUNTING_INTEGRATION` not set; no service role in env |
| Per-report UI click-through | Manual QA |
| Export PDF parity | Out of scope for accounting pass |

---

## 9. Remaining blockers (severity)

| Severity | Blocker |
|----------|---------|
| **P0** | **E2E DB verification not completed** — cannot claim report accuracy for production. |
| **P1** | **Historical invoices** may lack COGS journals until backfill policy approved (`erp_audit_missing_sale_cogs_gl`). |
| **P1** | **Credit note COGS** on GL uses current WAC, not original invoice cost — business rule. |
| **P2** | **Cash flow** is indirect (P&L-based), not cash-receipt report like Zoho “Cash Flow” direct view. |
| **P2** | **Sales reports** are management margin reports; **P&L** is posted GL — footnotes required when both shown. |
| **P3** | Tabular export KPI footers still sum **filtered** rows (`report-summaries.ts`) — intentional for export slice, not statement totals. |

---

## 10. How to complete verification to **PASS — VERIFIED**

1. Reset **local/staging** DB; apply all migrations through `20261020170000`.
2. Seed Scenario A (50@5, sell 20@10 ex-tax); assert journals, `store_product_inventory`, P&L, TB.
3. Run Scenarios B–G per Phase 4 spec.
4. Run `npm run erp:accounting:validate` with integration flag.
5. Re-run this checklist; update status column to **Pass (E2E)** where evidenced.

---

*This document supersedes the “audit-only” readiness statement for items fixed in migrations `20261020160000` and `20261020170000` but does not replace live database sign-off.*
