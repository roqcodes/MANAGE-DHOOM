# BUYHUB ERP — Full Reports System Analysis

**Date:** 2026-10-22  
**Product:** DHOOM-MANAGE (BUYHUB)  
**Scope:** All 34 hub reports in `src/common/erp/report-types.ts`, aging drill-downs, and Payments Made (`/admin/erp/supplier-payments`).  
**Constraint:** Analysis and specification only. No code edits and no migrations in this pass.  
**Method:** Code and SQL review of RPC bodies and UI on **this working tree**, compared to **`origin/master` (commit `85678cd`, tag v4.3)**. Screenshot arithmetic is observational. Live database E2E (`erp:accounting:validate`) was **not** run. **Commercial discount (DC) posting was not checked against pushed source** — see Source of truth below.  
**Revision:** 2026-10-22 — review pass 2 (DC git provenance, dead-stock citation, low-stock table, policy vs error).

### Source of truth (git)

| Set | What it is |
|-----|------------|
| **Pushed** | `origin/master`. Report RPCs through `20261020180000_report_salesman_filter.sql` / `20261020180000_accounting_integration_service_role.sql`. **No** `credit_kind`, **no** `record_erp_commercial_discount`, **no** `DISCOUNT_ALLOWED` / `DISCOUNT_RECEIVED`, **no** product_name `'Sales discount'`. `git grep` on `origin/master` is empty for those strings. |
| **Local untracked (not in any remote branch)** | `supabase/migrations/20261021140000_erp_commercial_discount.sql`, `20261021153000_…`, `20261021160000_commercial_discount_dc_numbering.sql`, `20261022150000_reinforce_customer_discount_dc.sql`, `src/modules/erp/services/erp-commercial-discount.service.ts`, `src/common/erp/commercial-discount.ts`. These files exist only as **untracked** working-tree files (`git status` `??`). |
| **Local untracked, not a reports RPC** | `20261022130000_fix_empty_expiry_date_cast.sql` — purchase-bill JSON `expiry_date` cast. **Does not** redefine `get_erp_dead_stock_report`. Dead stock RPC on origin is `20261019180000_erp_dead_stock_report.sql`. |

Claims that depend on the untracked DC files are tagged **[local untracked / not on origin]**. The screenshot row named `Sales discount` is still a fact on the UI; the causal story (DC RPC inserting that line) is **not in pushed source**. It may already be applied on a live database that is ahead of git; that was **not** verified.

**Registry:** `src/common/erp/report-types.ts`  
**API:** `GET /api/admin/erp/reports` → `src/modules/erp/services/erp-reports.service.ts` (`runErpReport`)  
**Hub:** `/admin/erp/reports` → `/admin/erp/reports/{slug}`

**Relationship to prior audits**

| Document | Status vs this file |
|----------|---------------------|
| `BUYHUB_REPORTS_ACCURACY_AND_COMMUNICATION_AUDIT.md` | Open defects here supersede that list. |
| `BUYHUB_FINAL_ACCOUNTING_AND_REPORTS_VERIFICATION.md` | P&L COGS split / sales CN netting / BS search totals remain **code-fixed, not E2E certified**. Structural BS/sign/cash-flow/AR-AP issues below were **not** closed. |

---

## 1. Executive verdict

**Store scope:** Every report is **store-scoped** to the header active store. **All stores is not a filter** and must be removed. This analysis is Store A. `je.store_id IS NULL` journals in a store view are leaks, not consolidation.

The reports module is **not production-ready as a set of financial statements**. It is a mix of three data layers that share the same words (AR, AP, Stock, Revenue, Sales) without saying which layer they use:

1. **Posted GL** — `journal_entries` / `journal_entry_lines` (`opening + debit − credit`).
2. **Subledger** — invoice and purchase-bill `balance_due`, customer/supplier payments.
3. **Operational snapshot** — `store_product_inventory` qty × store WAC.

Zoho Books and Odoo 17 keep those layers separate and **reconcile** them. BUYHUB prints them on adjacent screens as if they were the same number.

**What already works (internal arithmetic)**

- P&L screenshot math is internally consistent once you accept GL Income vs operational net sales.
- Sales by Item row arithmetic for the attached Last 7 days snapshot **ties**.
- Payments Received cash total **30.4 = 15 + 10 + 5.4**.
- P&L COGS vs operating expense split exists in latest SQL (`20261020160000` / grants in `20261020180000_accounting_integration_service_role.sql`).

**What fails professional statement rules**

- Balance Sheet **does not balance** (Income/Expense excluded; no Current year earnings).
- Assets and liabilities are shown with **raw debit−credit signs** (credit-normal AP often negative).
- Cash Flow **indirect WC signs are wrong on raw D−C balances** (liability/AP/equity use +Δ instead of −Δ), so the headline can move when cash does not. `net_change_reconciled` is computed and unused. GRNI is omitted from section mapping.
- Finance Summary AR/AP KPIs are **positive-only subledger**; position tables are **GL**.
- Sales by Item lists a row named **Sales discount** (screenshot). **Pushed** SQL unions all credit-note lines by `product_name` with no kind filter. The synthetic DC insert that *creates* that name is **[local untracked / not on origin]**.
- Precision: app policy is 4 dp calc / 3 dp display; most RPCs `ROUND(..., 2)`, so non-zero third decimals disappear or drift.

No number in this document is a “plug.” **Not every screenshot mismatch is closed.** Layer, date window, and sign explain many gaps. At least one AR reconstruction (period sales − cash − DC vs GL AR) does **not** tie; that remainder is **unknown without GL drill-down** (§5.3).

---

## 2. Professional baseline (Zoho Books / Odoo 17)

| Topic | Market standard | BUYHUB today |
|-------|-----------------|--------------|
| Balance Sheet | Point-in-time. **Assets = Liabilities + Equity.** Odoo inserts **Current year earnings** from open P&L in real time. Assets and liabilities shown **positive** in their natural section. | Trial balance partitioned in UI. Income/Expense dropped. No earnings line. Raw signed balances. |
| P&L | Period. Operating income → COGS → Gross profit → Operating expenses → Net. Accrual vs cash basis is explicit. Discounts on **Discount Allowed / Received**, not mixed into SKU sales. | Same section order after COGS fix. Accrual (posted JE date) only. DC does not reverse Income. |
| Cash flow | Indirect: start from net income, adjust WC, **must equal cash GL movement**. Zoho flags this as indirect from P&L. | Indirect SQL exists but WC uses +Δ on raw liability balances (should be −Δ for every non-cash BS account). UI ignores `net_change_reconciled` as a hard check. |
| Trial Balance | Period movement **or** closing Dr/Cr per account, labeled honestly. | Columns named period debit/credit are **lifetime gross** to as-of. |
| Sales by item | SKUs / products. Returns as returns. Discounts on a discount account or a separate report (**policy**, not a BUYHUB bug by itself). | **Pushed:** unions all `erp_credit_note_lines` by `product_name`. Screenshot shows a `Sales discount` row. **DC insert of that name is not on origin.** |
| AR / AP | Partner ledger (positive amounts owed) **and** GL control account, with a recon. | Same labels, different formulas per page. Store Finance KPI drops credits (`balance_due > 0`). |
| Inventory valuation | On-hand at cost, reconcilable to stock account (and GRNI / interim received as **separate** accounts). | Qty × WAC snapshot. Not tied to GL `STOCK`. GRNI is a BS line only. |
| Date | Report states **as-of** vs **period**, and **which date field**. | Global session date bar; mixed presets; collection reports still use invoice `created_at`. |
| Precision | Currency to functional decimals; never drop a material remainder without a rounding policy. | SQL 2 dp vs UI 3 dp. |
| Year-End Close / Equity | Retained Earnings roll-over is enforced via an explicit year-end close journal or automated boundary rule. | No formal Fiscal Year boundary or closing process. Unclosed P&L must be manually bridged. |
| Statements | **Customer/Vendor Statements:** A chronological ledger showing all invoices, payments, and running balance for a specific partner. | Not implemented. `customer-balance` is a static snapshot, not a statement of account. |
| Accrual vs Cash | Ability to toggle reporting basis (Accrual records on invoice date, Cash records on payment date). | Strictly Accrual-basis (based on posted journal entry date). |

**Sign convention used below**

- **GL raw:** `balance = opening_balance + Σ debit − Σ credit` (every BUYHUB GL report).
- **Presentation (target):** debit-normal (asset, expense, AR) show `+(opening + D − C)`; credit-normal (liability, equity, income, AP) show `−(opening + D − C)` so section totals are positive when the account is in its normal state.

---

## 3. Cross-cutting defects

| ID | Sev | Defect | Why it exists | After (spec) |
|----|-----|--------|---------------|--------------|
| X-DATE | P0 | Global `AdminDateRangeProvider` (`buyhub.admin.dateRange.v1`) overrides per-report defaults (`this_month` vs `today` vs `last_7`). | Shared header range; only Activity Log resets on mount. | Per-report initial preset on enter **or** a visible “basis: Today / This month” that cannot silently differ from the page title. |
| X-LAYER | P0 | AR, AP, Stock, Revenue mean GL, subledger, or WAC depending on page. | Different RPCs, same English labels. | Badge on every title: **GL / Subledger / Operational**. |
| X-SIGN | P0 | Raw `D−C` printed on BS, Finance position tables, TB. | One SQL balance formula for all categories. | Presentation flip by `account_category` / account type. |
| X-BS | P0 | Assets ≠ L+E because P&L accounts are omitted and not rolled into equity. | `partitionBalanceSheetRows` keeps only Assets, AccountsRecievable, Liability, AccountsPayable, Equity. | Must include unclosed P&L on the sheet (Odoo-style **Current year earnings**, or a period-close journal). **Which fiscal-year boundary** to use is **policy**, not an error. Show variance if journals are unbalanced. |
| X-PREC | P1 | `decimal-precision.ts`: calc 4 dp, display 3 dp; RPCs `ROUND(..., 2)`. | Historical money-as-cents thinking vs payment 3 dp. | Aggregates at **3 dp money / 3 dp qty** (calc 4 dp). Display max 3 dp. **Show every non-zero third decimal.** Trailing zeros may trim (`2.1` not `2.100`). |
| X-STORE | P1 | **Product rule: every report is store-scoped** (active store, screenshots = Store A). UI still has an **All stores** report filter; SQL still allows `p_store_id` null and NULL-store journals. | See **Store scope** below. | **Remove the report Store filter entirely** (including All stores). Bind `p_store_id` to the shell active store. `je.store_id = p_store_id` only. Openings allocated per store or omitted. |
| X-FILTER | P2 | Tabular KPI/footers sum **search-filtered** rows (`report-summaries.ts`). | Convenient for exports of a slice. | Statements: full RPC totals. Tables: banner “totals = visible rows”. |

### Store scope (product rule)

**Rule:** Reports are **always store-scoped**. The store is the **admin header active store**, not a report filter. **“All stores” must not exist as a filter option at all.** Numbers in this document are Store A. There is no consolidated books view.

**What the UI actually does (defect vs the rule)**

- Report pages still render a **Store** dropdown with **All stores** (`storeId === ""` → RPC `p_store_id` null) in `use-business-report-filters.ts` (`storeFilter` options include `{ value: "all" }`) and `report-viewer.tsx` (`<option value="">All stores</option>`).
- Most reports default `storeId` to `activeStoreId`, then still let the user pick All stores.
- **Receivables** and **activity-logs** skip applying `activeStoreId`, so they open on All stores.
- **Store Wise Stock** (`filters: {}`) never sends a store; RPC totals **every** store.

**What GL SQL actually does even when Store A is selected**

```sql
(p_store_id IS NULL OR je.store_id = p_store_id OR je.store_id IS NULL)
```

`je.store_id IS NULL` journals and **global** `accounts.opening_balance` / `users.opening_balance` are added into Store A. Trial Balance `HAVING` ignores the store filter. Finance Summary with a store uses **subledger** AR/AP (`balance_due > 0`), not GL — that is the live path; the `p_store_id IS NULL` GL AR/AP branch is unused in store-scoped operation.

**After:**

- Delete the report-level Store filter (`filters.store`, All stores option, empty `storeId`).
- Always send `p_store_id = activeStoreId` from the shell. RPC must **require** a store (reject null).
- `je.store_id = p_store_id` only (drop `OR je.store_id IS NULL` and the `p_store_id IS NULL` branch).
- Store Wise Stock: same rule — scoped to the active store (one store’s totals). Do not use an All-stores filter to mean “compare every store.” If a cross-store comparison is needed later, it is a **different labeled report**, still without an All-stores control.

**Date resolver** (`erp-reports.service.ts`): omitted dates → month-to-date server default; explicitly empty from/to → `2000-01-01` .. today (“all dates”).

---

## 4. Three-layer map

```
Posted GL ──────────► Balance Sheet, Trial Balance, P&L, Cash Flow, Finance position tables
Invoice/bill due ───► Customer/Vendor Balance, Aging, Finance AR/AP KPIs (store-scoped subledger)
SPI qty × WAC ──────► Stock / Minus / Store-wise / Dead stock
```

If two screens disagree, check **layer**, then **date field**, then **sign**, then **rounding**. Do not invent an adjustment.

---

## 5. Screenshot walkthrough (attached images)

These snapshots are **not one closed period**. Header presets in the images:

| Screen | Preset in image | Store |
|--------|-----------------|-------|
| Customer Balance | (session; often Today) | Store A |
| Balance Sheet | This month, as-of 10/22/2026 | Store A |
| P&L | This month | Store A |
| Cash Flow | **Today** | Store A |
| Finance Summary | This month | Store A |
| Payments Received | Last 7 days | Store A |
| Payments Made | Last 7 days | Store A |
| Sales by Item | Last 7 days | Store A |
| Vendor Balance | Last 7 days (as-of style list; RPC is point-in-time) | Store A |

### 5.1 Sales by Item (Last 7 days, Store A)

| Item | Qty | Net ex-tax | Incl tax | Tax | COGS | Profit |
|------|-----|------------|----------|-----|------|--------|
| 5D GLASS TOKIN | 5 | 8.7 | 10 | 1.3 | 4 | 4.7 |
| 5D TOKIN | 18 | 30.78 | 35.4 | 4.62 | 100 | −69.22 |
| MATTE MAGSAFE CASE | 28 | 121.74 | 140 | 18.26 | 56 | 65.74 |
| Sales discount | −2 | −105.39 | −105.39 | 0 | 0 | −105.39 |
| **Total** | **49** | **55.83** | **80.01** | **24.18** | **160** | **−104.17** (KPI −104.117) |

**Checks (no plugs)**

- 8.7 + 1.3 = 10; 30.78 + 4.62 = 35.4; 121.74 + 18.26 = 140.
- SKU ex-tax 8.7 + 30.78 + 121.74 = **161.22**.
- SKU incl-tax 10 + 35.4 + 140 = **185.40**.
- After DC: 161.22 − 105.39 = **55.83**; 185.40 − 105.39 = **80.01**.
- Qty 5 + 18 + 28 − 2 = **49** (two DC documents, each qty 1).
- Profit 4.7 − 69.22 + 65.74 − 105.39 = **−104.17**. KPI **−104.117** does **not** follow from 2 dp row rounding (four 2 dp lines can drift by **0.02** at most; the gap is **0.053**). **Cause unknown** — not X-PREC row-order. Needs the raw JSON for that request (KPI field vs `profit` column, extra row, or a third-decimal source).

**Why a row named “Sales discount” appears**

**Pushed (`get_erp_sales_by_item` in `20261020180000_report_salesman_filter.sql`):** `credits` CTE sums **all** `erp_credit_note_lines` in range (status `issued`/`applied`) grouped by `product_name`, `variant_id`, `channel`, then `UNION`s those keys with invoice SKUs. There is **no** `credit_kind` column in that function on origin. Qty **−2** means two credit-note lines with that `product_name` and quantity 1 each (or one line qty 2).

**[local untracked / not on origin] hypothesis:** `record_erp_commercial_discount` in untracked `20261021140000_erp_commercial_discount.sql` inserts `erp_credit_note_lines.product_name = 'Sales discount'`, null product/variant, qty 1, `credit_kind = 'discount'`, and posts DR `DISCOUNT_ALLOWED` / CR `ACCOUNTS_RECIEVABLE`. That matches the screenshot **if** live already ran those files. **Not verified against `origin/master` or against the live `pg_proc` catalog.** Alternative that *is* possible on pushed schema: a real product or CN line literally named `Sales discount`.

### 5.2 P&L (This month, Store A)

| Line | Amount | Reason |
|------|--------|--------|
| Discount Received | 37.5 | GL income account with that **name** (screenshot). Seed/`DISCOUNT_RECEIVED` posting is **[local untracked / not on origin]** |
| Income | 161.22 | Posted sales income; equals SKU ex-tax **before** the Sales-by-Item discount row |
| Total operating income | 198.72 | 161.22 + 37.5 |
| COGS | 160 | Matches Sales by Item COGS **in this snapshot** (same 160; still different **date windows** in general) |
| Gross profit | 38.72 | 198.72 − 160 |
| Discount Allowed | 110.39 | GL expense account with that **name**. **Hypothesis (untracked DC + settlement 5):** 105.39 + 5. **Not proven** from pushed source. |
| Other Expense | 150 | Separate expense account |
| Total operating expense | 260.39 | 110.39 + 150 |
| Net profit / loss | −221.67 | 38.72 − 260.39 |

P&L **Income 198.72** vs Sales by Item **80.01** is **not** a calc error of 198.72 vs 80.01 as one formula. Income **161.22** matches SKU ex-tax before the discount row; the item report **nets** the −105.39 line into “sales.” Whether that discount **should** sit in opex (below gross profit) vs contra-revenue is **policy** (Zoho/Odoo often use a discount account). **[local untracked]** DC posting to `DISCOUNT_ALLOWED` would implement the opex treatment; that function is **not on origin**.

### 5.3 Balance Sheet vs Finance Summary (This month / as-of 10/22/2026)

| Line | BS / position table (GL raw) | Finance KPI (store subledger) |
|------|------------------------------|-------------------------------|
| Accounts Receivable | −105.39 | **0** (`SUM(invoice.balance_due) WHERE balance_due > 0`) |
| Bank | −656.6 | (not a KPI) |
| Stock | 444.1 | (not a KPI) |
| Total assets | **−317.89** | same position table |
| Accounts Payable | −86.6 | **105** (positive bills only) |
| Goods Receipt Pending | 105 | — |
| Overseas Tax Payable | 77.82 | — |
| Total L&E | **96.22** | same |

**Assets −317.89 ≠ L&E 96.22.** Difference is open Income/Expense (and sign presentation), not a missing journal plug.

**AP 105 vs −86.6:** Vendor Balance TEST VENDOR **105** + TOKIN **−18.4** → subledger net **86.6**. GL prints credit-normal AP as **−86.6**. KPI drops the credit.

**AR 0 vs −105.39 vs Customer Balance all 0 — what is known vs unknown**

- Finance AR KPI **0**: store path sums `invoices.balance_due` where `status IN ('issued','partial','paid','overdue')` **and** `balance_due > 0`. Credits and drafts never enter this KPI.
- Customer Balance **all zeros**: `opening + Σ balance_due` for **every non-cancelled invoice** (includes `draft` and `pending`). That can be 0 while GL AR is not.
- **[local untracked / not on origin]:** untracked DC SQL posts CR `ACCOUNTS_RECIEVABLE` without necessarily changing invoice `balance_due`. That **could** put GL AR negative while the partner list is 0. **Not in pushed source.** Do not treat it as a proven close of −105.39.

**Invalid reconstruction (do not treat as a close):** mixing Last 7 days Sales by Item with Last 7 days payments:

```
185.40  SKU incl-tax (period)
− 30.40 cash received (period)
−  5.00 settlement (list KPI, not the payments RPC)
−105.39 Sales-by-Item “Sales discount” row (period; origin of that line **unverified vs origin**)
= 44.61
```

**44.61 ≠ GL AR −105.39**, and **185.40 − 35.40 = 150** is not an AR balance either (period activity ≠ as-of control). Closing GL −105.39 to subledger 0 and to this 44.61 needs the AR ledger (opening, other dates, tax on DC, unallocated cash, journals). **That gap is unexplained in this document.**

**Purchases 887 vs Payments Made 687 vs COGS 160:** three definitions — bill `total_amount` in period, supplier payment `total_amount` in period, recognized COGS GL.

### 5.4 Cash Flow (Today, Store A)

| KPI | Value | Meaning |
|-----|-------|---------|
| Beginning cash | −656.6 | Cash+Bank GL as-of yesterday |
| Ending cash | −656.6 | Cash+Bank GL as-of today |
| Net change shown | **−105** | Indirect `net_income + WC`. AP line is **+Δ of raw D−C** (wrong sign for a credit-normal account) |
| Cash GL movement | **0** | `net_change_reconciled = ending − beginning` (computed, unused as a check) |
| Net income | 0 | No P&L activity **today** |

Root cause is the WC sign on raw balances (§7.1), not “the UI picked the wrong headline field” as the primary bug. `net_change_reconciled` should **fail the report** when it disagrees. Broken even without comparing to This month P&L.

### 5.5 Payments

- Received: 15 + 10 + 5.4 = **30.4** cash. Settlement discount **5** is list-UI, not the report RPC.
- Made: paid **687**, settlement **7.5**, payable KPI **105** = positive open bills.

---

## 6. Precision policy (current vs after)

| Layer | Before | After (spec) |
|-------|--------|----------------|
| App calc | 4 dp (`roundCalc`) | Keep 4 dp internally |
| Display | max 3 dp, trailing zeros trimmed | Keep; **do not hide 2.001** |
| Report SQL | Mostly `ROUND(..., 2)` | Money **3 dp**; qty **3 dp**; unit WAC stored 4 dp, line value `ROUND(qty × cost, 3)` then display |
| Payments | 3 dp entry | Report RPCs must not round those to 2 dp before sum |
| Footer | Sum of already-rounded 2 dp rows | Sum at calc precision, then display 3 dp |

Screenshot evidence: recognized profit KPI **−104.117** vs row sum **−104.17**. That **0.053** gap is **not** explained by summing four 2 dp rows (max 0.02). Treat as **unknown**; do not file it under X-PREC.

---

## 7. Per-report catalog

For each report: **Layer**, **Date field**, **Before formula**, **Defects**, **After formula**. Severity is the worst defect on that report.

---

### 7.1 Business Overview

#### Balance Sheet — `balance-sheet`

| | |
|--|--|
| **UI** | `src/modules/admin/views/reports/business-overview/balance-sheet-report.tsx` |
| **RPC** | `get_erp_trial_balance` — `supabase/migrations/20260829230000_erp_reports.sql` |
| **Layer** | GL |
| **Date** | As-of `p_as_of` (synced from `dateRange.to` when `asOfDate` is set). Posted `transaction_date <= as_of`. |

**Before**

```
row.balance = ROUND(opening + Σdebit − Σcredit, 2)   -- all categories
sections = rows where category ∈ {Assets, AccountsRecievable, Liability, AccountsPayable, Equity}
total_assets = Σ asset balances          -- raw
total_L_and_E = Σ liability + equity     -- raw
-- Income and Expense rows discarded
```

**Defects:** X-BS P0, X-SIGN P0, X-STORE P1. Screenshot −317.89 vs 96.22. **P0:** `get_erp_trial_balance` in `20260829230000_erp_reports.sql` line 47 is `AS period_credit, 4` — a **PostgreSQL syntax error**. The migration cannot apply on a fresh database. Live TB/BS therefore **cannot be this repo function**; production must be an older or hand-patched body.

**After**

```
raw = opening + D − C
presentation_balance =
  debit_normal  → +raw                  -- +(opening + D − C)
  credit_normal → −raw                  -- −(opening + D − C)  == +(C − D − opening)

current_year_earnings = unclosed P&L through as_of   -- Odoo inserts this; fiscal-year cut is POLICY
equity_total = equity_accounts + current_year_earnings
assert |total_assets − (total_liabilities + equity_total)| ≤ 0.001
else show Unbalanced journals variance (do not invent a plug)
```

**Zoho/Odoo:** Dedicated BS; liabilities positive; earnings on equity.

---

#### Profit and Loss — `profit-and-loss`

| | |
|--|--|
| **UI** | `business-overview/profit-and-loss-report.tsx` |
| **RPC** | `get_erp_profit_and_loss` — logic `20261020160000_financial_reporting_cogs_accounting.sql`; grants `20261020180000_accounting_integration_service_role.sql` |
| **Layer** | GL |
| **Date** | `je.transaction_date BETWEEN from AND to` |

**Before**

```
income_line     = ROUND(Σcredit − Σdebit, 2)   -- account_category = Income
cogs_line       = ROUND(Σdebit − Σcredit, 2)   -- Expense AND type name = 'Cost of Goods Sold'
opex_line       = ROUND(Σdebit − Σcredit, 2)   -- other Expense
total_income    = Σ income_line
total_cogs      = Σ cogs_line
total_opex      = Σ opex_line
gross_profit    = total_income − total_cogs
net_profit      = total_income − total_cogs − total_opex
```

**Defects:** Structure is **correct** vs Zoho. P1: NULL-store journals still included while Store A is selected (violates store scope). **P1:** COGS is selected by matching `account_types.name = 'Cost of Goods Sold'` (string), not account code `COST_OF_GOODS_SOLD`. Renaming the type silently dumps COGS into opex. P2: Discount Allowed in opex (correct GL) vs users expecting it inside “sales.” Inner join hides zero-activity accounts.

**After**

```
Keep section math.
Classify COGS by account code / type key, not display name.
Labels: "Total income (GL, incl. Discount Received)" 
        "Discount Allowed (expense, not a SKU)"
Optional footnote: operational net sales = SKU income − customer DC (subledger/DC docs), not this statement.
Store: required; `je.store_id = p_store_id` only (no NULL-store bleed).
Precision: ROUND 3 dp.
```

**Zoho/Odoo:** Same P&L section order. **Where discounts sit vs gross profit is policy**, not an implementation error in the pushed P&L (it reports whatever accounts are typed Income vs Expense). Untracked DC SQL *would* post customer concessions to an Expense named Discount Allowed.

---

#### Cash Flow Statement — `cash-flow-statement`

| | |
|--|--|
| **UI** | `business-overview/cash-flow-report.tsx` |
| **RPC** | `get_erp_cash_flow_statement` — `20261014102000_erp_cash_flow_statement.sql` |
| **Layer** | GL (indirect) |
| **Date** | P&L for `[from, to]`; cash as-of `from−1` and `to`; WC = Δ account balances |

**Before**

```
net_income = get_erp_profit_and_loss(...).net_profit
beginning_cash, ending_cash = Σ balances of account types Cash, Bank
-- balances are raw: opening + D − C
WC_asset     = −Δ   -- Assets, AccountsRecievable
WC_other     = +Δ   -- Liability, AccountsPayable, Equity
operating.total = net_income + Σ operating WC
net_change = operating + investing + financing          -- UI headline
net_change_reconciled = ending_cash − beginning_cash    -- computed, unused
```

Because every account is stored as D−C, a balanced journal implies `Δcash_raw = −Σ Δnon_cash`. After replacing P&L raw with `net_income`, **every non-cash balance-sheet Δ must be subtracted** (`−Δ`). Using `+Δ` on AP/liability/equity **inverts** those lines. Screenshot: AP **−105** with cash GL unchanged.

`get_erp_cash_flow_section` maps Liability types `Other Current Liability`, `Credit Card`, `Overseas Tax Payable`, `Other Liability`. Type **`Goods Receipt Pending`** is **not** in the list → `section IS NULL` → **silently dropped**. GRNI can move (BS line 105) without appearing in cash flow, so the statement cannot reconcile when GRNI moves.

**Defects:** P0 wrong WC sign on raw D−C (`+Δ` for Liability/AP/Equity). P0 GRNI omitted from section map. P0 `net_change_reconciled` not used as a hard check (screenshot −105 vs cash Δ 0). P2 Today preset: net income 0, WC still moves.

**After**

```
Keep the indirect method as the headline:
  WC_effect = −(balance_end − balance_start)   -- ALL non-cash BS accounts (raw D−C)
  include Goods Receipt Pending (and any other BS type) in get_erp_cash_flow_section
  net_change = net_income + Σ WC_effect + investing + financing

Hard check (do not replace the headline with this):
  if |net_change − (ending_cash − beginning_cash)| > 0.001
    → fail / banner using net_change_reconciled
    → do not plug the difference
```

**Zoho:** Indirect method; increase in AR deducted because cash not collected. Headline stays the indirect total; cash movement is the **control**, not the substitute formula.

---

#### Day Book — `day-book`

| | |
|--|--|
| **RPC** | `get_erp_day_book` — `20260829230000_erp_reports.sql` |
| **Layer** | `erp_account_transactions` — **one row per journal line for every account**, not a cash-only register |
| **Date** | `transaction_date` in range |

**Before:** Hub copy says “Cash and bank account transactions.” SQL selects **all** `erp_account_transactions` for the store/date (`20260829230000_erp_reports.sql`). That table is populated from posted journal **lines** across accounts, so the report is a **full account-line listing**, not a cash book.

**After:** Filter to account types Cash, Bank (optional Credit Card) if the product name stays “Day Book”; **or** rename to “Account lines.” Running balance per account.

**Severity:** P1 (wrong report identity).

---

#### Finance Summary — `finance-summary`

| | |
|--|--|
| **UI** | `business-overview/finance-summary-report.tsx` |
| **RPC / TS** | `get_erp_financial_dashboard` + `getStoreFinancialDashboard`; position = second fetch of trial balance |
| **Layer** | Mixed: P&L GL; AR/AP KPI **store subledger** (product is always store-scoped); position GL |

**Before (store selected)**

```
revenue_kpi     = P&L total_income          -- labeled "Revenue (period)" / net_income_ytd
cogs_kpi        = P&L total_cogs
purchases_kpi   = Σ erp_purchase_bills.total_amount  -- purchase_date in range, status finalized/partial/paid
net_profit_kpi  = P&L net_profit
AR_kpi          = Σ invoices.balance_due
                    WHERE status IN ('issued','partial','paid','overdue')
                      AND balance_due > 0
AP_kpi          = Σ bills.balance_due
                    WHERE status IN ('finalized','partial','paid')
                      AND balance_due > 0
position tables = partitionBalanceSheetRows(trial_balance)
```

**Not used in store-scoped operation:** `p_store_id IS NULL` branch of the same RPC (`get_account_balance` on AR/AP). Do not mix that path into Store A numbers.

**Defects:** P0 AR 0 vs GL −105.39; AP 105 vs −86.6. P1 revenue label; `asOf` not always `dateTo`. P2 purchases vs COGS unlabeled in older UX (copy now mentions it; still easy to misread).

**After**

```
asOf := dateTo always
AR_gl, AP_gl = presentation balances of control accounts at asOf
AR_open, AP_open = Σ balance_due (include negatives; show credits)
AR_unallocated = Σ customer payment unallocated
show recon: AR_gl vs (AR_open − unallocated − DC-not-on-invoice)
never drop credits from a KPI named "Accounts payable"
purchases_kpi stays bills; keep COGS separate (already correct)
```

**Low stock KPI (verified):** `get_erp_financial_dashboard` (pushed `20261020160000` and `20261020180000_accounting_integration_service_role.sql`) counts:

```sql
SELECT COUNT(*) FROM public.inventory i
WHERE i.stock <= COALESCE(i.reorder_point, 0)
  AND (p_store_id IS NULL OR i.store_id = p_store_id)
```

`public.inventory` **still exists** (rewired in `20260908120000`, RLS in `20261002120000`). Stock **reports** read `store_product_inventory`. Whether `inventory` is a stale dual-write vs SPI is **not** fully proven here; the KPI **does** hit `inventory`, not SPI. Store Finance Summary **snapshot path** in `getStoreFinancialDashboard` **hardcodes `low_stock_count: 0`**. The TS fallback path (if snapshot fails) counts `store_product_inventory` with a hardcoded threshold of 10.

---

### 7.2 Sales

Invoice date used by later sales RPCs (`20261020180000_report_salesman_filter.sql`):

```
invoice_date = COALESCE(issued_at::date, created_at::date)
cn_date      = credit_note_date
```

#### Daily Collection — `daily-collection-report`

| | |
|--|--|
| **RPC** | `get_erp_daily_collection_report` — `20261014110000_erp_sales_reports.sql` (**not** updated for `issued_at`) |
| **Layer** | Subledger |
| **Date** | Invoices: **`created_at::date`**. Payments: `payment_date`. |

**Before**

```
per day:
  invoice totals = Σ total_amount, gst, discount, balance_due
    WHERE status NOT IN ('cancelled','pending')   -- drafts included
  payments by mode from erp_customer_payments
  net_total column = Σ total_amount   -- mislabeled (incl tax)
```

**After:** `COALESCE(issued_at, created_at)`; exclude `draft`; rename incl-tax; optional settlement discount as AR cleared.

**Severity:** P1 date basis vs all other sales reports.

#### Monthly Collection — `monthly-collection-report`

Same as daily, rolled by calendar month. Same before/after.

#### Sales by Customer — `sales-by-customer`

**Before**

```
sales = Σ invoice totals − Σ cn.subtotal/tax/total     -- all CN in range (pushed: no credit_kind)
total_discount = Σ invoice.discount                    -- invoice field only
profit = invoice margin − (cn_subtotal − cn_cogs)
```

**Defects (pushed):** All credit notes in the date range net into sales. `total_discount` is the invoice `discount` field only. `balance_due` in period is not AR as-of.

**After (policy + optional untracked DC):** Keep netting **returns**. If `credit_kind` exists in the deployed DB, split discount documents — that column is **[local untracked / not on origin]**.

```
gross_sales     = Σ invoice taxable / total
returns         = Σ CN that are returns
net_sales       = gross_sales − returns
line_discount   = Σ invoice.discount
```

#### Sales by Item — `sales-by-item`

**Before** (latest `20261020180000`)

```
sales CTE: invoice_items on posted invoices
  net_sales_ex_tax = Σ COALESCE(taxable_amount, total − gst)
  sales_incl_tax   = Σ line total
  COGS/profit      = erp_invoice_item_margin_components
credits CTE: ALL erp_credit_note_lines in date range
  grouped by product_name, variant_id, channel
keys = sales UNION credits
net columns = sales − credits
```

**Defects (pushed):** Any CN line becomes an “item” keyed by `product_name` (screenshot: `Sales discount`). Credit COGS uses `erp_resolve_invoice_line_cost` (current store cost) × qty — **not** the same as salesman/customer `erp_credit_note_recognized_cogs_total`. Profit can **disagree** between Sales by Item and Sales by Salesman on the same returns. KPI **−104.117** vs row **−104.17**: cause **unknown**.

**[local untracked / not on origin]:** treating `credit_kind = 'discount'` as a fake SKU is the untracked DC insert. Do not cite `record_erp_commercial_discount` as pushed.

**After (pushed-safe):** Do not list non-product CN lines as SKUs (null `product_id`, or a document-level total). **If** `credit_kind` is deployed later, exclude `'discount'` from item keys. Qty/money ROUND 3 dp.

**Zoho/Odoo (policy):** Product sales stay on products; discounts on a discount account.

#### Sales by Salesman — `sales-by-salesman`

**Before (pushed):** Invoice aggregates minus CN joined **`INNER JOIN invoices ON source_invoice_id`**. **Every** credit note without `source_invoice_id` is dropped (not a DC-only bug). Credit COGS = `erp_credit_note_recognized_cogs_total` (differs from Sales by Item).

**After:** `LEFT JOIN` or attribute salesman from the CN so orphan CNs still appear. **One** COGS helper for all sales reports. Splitting “DC vs CN” columns is **[local untracked / not on origin]** until `credit_kind` is pushed.

**Severity:** P1.

#### Credit Note Report — `credit-note-report`

**Before (pushed):** All `erp_credit_notes` with **`status <> 'cancelled'`** and `credit_note_date` in range. That **includes drafts**. Sales-by-* credit CTEs use **`issued` / `applied` only**. **No `credit_kind` on origin.**

**After:** Default filter `status IN ('issued','applied')`; optional include drafts. Surface `balance_remaining`. A document-type column is **[local untracked / not on origin]** until `credit_kind` is pushed.

**Severity:** P1 (identity).

---

### 7.3 Payments Received (hub) and Payments Made (not hub)

#### Payments Received — `payments-received`

| | |
|--|--|
| **RPC** | `get_erp_payments_received_report` — `20261020180000_report_salesman_filter.sql` |
| **Layer** | Cash receipts subledger |
| **Date** | `payment_date` |

**Before**

```
rows = erp_customer_payments in range
summary.total = ROUND(Σ total_amount, 2)     -- cash only
-- settlement_discount not in RPC
-- list UI at /admin/erp/payments uses is_bulk = false; RPC does not
```

Screenshot 30.4 is this formula. Settlement **5** is `erp_customer_payments.settlement_discount` on the **list** page.

**After**

```
cash_received        = Σ total_amount
settlement_discount  = Σ settlement_discount
AR_cleared           = cash_received + settlement_discount
align is_bulk / store scope with the payments list or label the difference
ROUND 3 dp
```

#### Payments Made — `/admin/erp/supplier-payments` (not in `ERP_REPORTS`)

**Before** (`erp-supplier-payments.service.ts`)

```
total_paid = Σ erp_supplier_payments.total_amount     -- payment_date filter
settlement = Σ settlement_discount
payable    = Σ bills.balance_due WHERE balance_due > 0
             AND status IN ('finalized','partial')     -- drops paid remainder and credits
```

Screenshot: 687 / 4 / 105 / 7.5.

**After:** Payable = Σ `balance_due` for open bills including negatives, **or** label “Open bills (positive only)”. Hub should list Payments Made next to Payments Received.

**Severity:** P0 vs Vendor Balance / BS AP if unlabeled.

---

### 7.4 Inventory

Valuation in reports:

```
unit_cost = COALESCE(spi.purchase_price, p.purchase_price)   -- store AVCO, stored ~4 dp
qty       = ROUND(spi.stock, 2)
value     = ROUND(qty * unit_cost, 2)
```

**Not** GL `STOCK`. GRNI (`GOODS_RECEIPT_PENDING`) is BS-only.

Recon (spec, not a plug):

```
GL_STOCK(as_of)  vs  Σ (qty × WAC) over SPI
gaps: opening journals, manual STOCK JEs, uncosted sales, negative stock, 2 vs 4 dp, COGS timing
GRNI residual = unbilled receives; do not add to stock report qty
```

#### Minus Stock — `minus-stock`

**RPC:** `get_erp_minus_stock_report` — `20261015180000_erp_minus_stock_report.sql`

**Before:** `WHERE spi.stock < 0`. Column **`shortage_qty = ROUND(ABS(spi.stock), 2)` already exists**. `stock_purchase_value = stock * cost` is still **negative**.

**After:** Keep `shortage_qty`. Add **`shortage_cost = shortage_qty × WAC`** (positive exposure). Do not use negative `stock_purchase_value` as the shortage KPI.

**Severity:** P2 presentation / known RPT-P2-007.

#### Stock Report — `item-stock`

**RPC:** `get_erp_item_stock_report` — `20261014120000_erp_inventory_reports.sql`

**Before:** On-hand + incoming from open PO and **draft** PB only. Low stock = `stock < 5` hardcoded. Default UI `in_stock` hides zeros. No date (correct for on-hand).

**After:** Incoming include in-transit transfers if tracked. Low stock vs reorder point. Split oversold vs on-hand asset value. Qty 3 dp. Optional GL STOCK recon footer.

#### Store Wise Stock — `store-wise-stock`

**RPC:** `get_erp_store_wise_stock_report` — still `20260908250000_product_first_line_matching_hardening.sql`

**Before:** **Violates store scope.** RPC sums **every** store; UI `filters: {}`; `erp-reports.service.ts` passes `{}`. Active store in the header is ignored.

**After:** Scope to the header active store (no All-stores filter). Align rounding with item stock; split oversold; `sku_count` only SKUs with `stock <> 0`.

**Severity:** P1 drift vs item-stock.

#### Dead Stock — `dead-stock`

**RPC:** `get_erp_dead_stock_report` — **pushed** `20261019180000_erp_dead_stock_report.sql`.  
**Do not cite** `20261022130000_fix_empty_expiry_date_cast.sql` here: that file is **untracked / not on origin**, and it does **not** redefine this RPC (purchase-bill empty `expiry_date` cast only).

**Before:** Heuristic FIFO-by-expiry lots vs **current** SPI qty. `p_as_of` cuts expiry only, not historical stock.

**After:** Label **Estimated (expiry FIFO vs on-hand)**. True dead stock needs lots/FEFO. Do not present as a GL number.

**Severity:** P1 if used for write-off.

#### Stock Transfer — `stock-transfer-report`

**RPC:** `get_erp_stock_transfer_report` — `20261014120000`

**Before:** `request_date` in range. `payment_paid = requested_value` if status **`IN ('completed', 'transfer_completed', 'approved')`** — **does not read** `erp_transfer_payments`.

**After:** (A) Transfer orders with real payments. (B) Stock movements on completion date × send-store WAC. No fake AP.

**Severity:** P1.

---

### 7.5 Purchases and Expenses

#### Purchase By Item — `purchase-by-item`

**RPC:** `get_erp_purchase_by_item_report` — `20261014140000_erp_purchase_reports.sql`

**Before**

```
purchase_value = Σ bill lines (purchase_date, status finalized/partial/paid)
transfer_value = Σ inbound transfer lines (completed/approved)
total_value = purchase_value + transfer_value
```

**After:** Keep both; column-split **vendor bills vs store transfers** (transfers are not AP). Precision 3 dp.

**Severity:** P2 if unlabeled.

#### Purchase By Vendor — `purchase-by-vendor`

**Before**

```
total = expense_amount + bill_amount
vendor_credit_count = COUNT(*)     -- amount NOT subtracted
```

**After**

```
gross_bills = bill_amount + expense_amount
credits_dc  = Σ vendor_credit.total_amount   -- issued/applied, incl discount DC
net_purchase = gross_bills − credits_dc
```

**Severity:** P1.

---

### 7.6 Receivables

#### Customer Balance — `customer-balance`

**RPC:** `get_erp_customer_balance_report` — `20261020180000_report_salesman_filter.sql`

**Before**

```
total_receivable = ROUND(opening_balance + Σ invoice.balance_due, 2)
-- invoices: status <> 'cancelled'  → includes draft and pending
-- all customer-role users, zeros included
-- no unallocated payments
-- no standalone DC AR
-- users.opening_balance is global (not store-scoped); added in full when a store is selected
-- no date (point-in-time)
```

**After**

```
invoice_due     = Σ balance_due
unallocated     = Σ payment.unallocated_amount
-- DC-not-on-invoice is [local untracked / not on origin]; do not require it on pushed schema
total_receivable = opening + invoice_due − unallocated
show GL control as a header recon
```

**Severity:** P0 vs BS AR.

#### Aging Summary (counts) — `customer-aging-summary`

**Before:** COUNT open invoices (`ABS(balance_due) > 0.001`) in buckets via `erp_invoice_days_past_due(as_of, due_date, created_at)`. Negative dues counted.

**After:** Split debit vs credit documents; do not call a credit “past due.”

#### Aging Details — `customer-aging-details`

Open invoices only. Date range on `COALESCE(issued_at, created_at)`. Misses unallocated cash and DC-only AR.

**After:** Include unallocated payment rows and unapplied DC as document types.

#### Aging Summary Values — `customer-aging`

**Before**

```
bucket sums of balance_due
total_due = opening + Σ balance_due     -- or filtered buckets
available_credit = Σ unallocated_amount -- NOT netted
```

**After:** `net_due = total_due − available_credit` as the primary owed figure.

**Drill-down:** `customer-aging-summary-details` — `get_erp_customer_aging_summary_customer_details`.

---

### 7.7 Payables

#### Vendor Balance — `vendor-balance`

**RPC:** `get_erp_vendor_balance_report` — `20261015280000_erp_payables_aging_reports.sql`

**Before**

```
balance = opening + Σ bill.total_amount − Σ vendor_credit.total − Σ bill.amount_paid
balance_due = Σ bill.balance_due
UI "Balance" = balance, not balance_due
```

Settlement discount can make `balance ≠ balance_due`. Screenshot: TEST 105, TOKIN −18.4, others 0.

**After:** Primary column **Open balance (`balance_due`)**. Lifetime `balance` secondary. Include unallocated supplier payments. Presentation: credits as credits, not “negative payable” without a label.

**Severity:** P0 three-definition AP (this `balance`, this `balance_due`, Finance KPI positive-only, GL signed).

#### PB Aging Summary — `vendor-aging-summary`

Counts of open bills by `erp_purchase_bill_days_past_due`. Same credit-count issue as AR.

#### PB Aging Details — `vendor-aging-details`

Open bills; `purchase_date` for range; age filter in `20261019140000`.

#### PB Aging Summary Values — `vendor-aging`

Mirror of customer aging; `total_due` ignores `available_credit`.

**Drill-down:** `vendor-aging-summary-details`.

---

### 7.8 Accountant

#### Trial Balance — `trial-balance`

**Same RPC as Balance Sheet.**

**Before**

```
period_debit  = ROUND(Σ debit  WHERE transaction_date <= as_of, 2)   -- LIFETIME, misnamed
period_credit = ROUND(Σ credit WHERE transaction_date <= as_of, 2)
balance       = opening + period_debit − period_credit
total_debit / total_credit = Σ those lifetime gross columns
```

UI labels “Net debit/credit.” Search filters the grid; footer uses RPC meta (correct for books check).

**P0 syntax:** line 47 `AS period_credit, 4` is invalid PostgreSQL. Fresh `supabase db reset` / apply of `20260829230000_erp_reports.sql` **fails**. Live `get_erp_trial_balance` is therefore **not this file**.

**HAVING ignores the store filter** (lines 68–74): activity predicates use `transaction_date <= p_as_of` only, **without** `p_store_id`. Accounts that are non-zero **only in other stores** still appear when a store is selected (balances in SELECT are store-filtered, HAVING is not).

**After**

```
Fix the SELECT list (delete `, 4`) and ship a replacement migration — repo must match live.
HAVING must use the same store predicate as the SELECT aggregates.
Rename: cumulative_debit, cumulative_credit
Or Zoho-style: show closing Dr OR Cr (one side) per account
Optional true period movement: activity BETWEEN from AND to
```

**Severity:** P0 un-applyable migration + live/repo drift; P1 misnamed columns; P1 HAVING store leak.

#### General Ledger — `general-ledger`

**RPC:** `get_erp_general_ledger_summary` (+ `get_erp_general_ledger` when `accountId` set) — `20261014150000_erp_accountant_reports.sql`

Here `period_debit` / `period_credit` **are** `BETWEEN from AND to`. **Same names as TB, different meaning.**

**After:** Distinct column keys. Footer = full account activity unless banner says filtered. X-FILTER P2.

#### Account Transactions — `account-transactions`

Posted lines in range; store filter includes NULL-store JEs. Source of truth for amounts.

**After:** Strict store mode; 3 dp; unfiltered statement totals.

---

### 7.9 Taxes

VAT engine (`20260903220000` family / reports `20261014150000`):

```
output_tax = GREATEST(0, Σ invoice.gst − Σ CN tax)     -- each side floored independently
input_tax  = GREATEST(0, Σ bill gst − Σ vendor credit tax)
total_tax_payable = GREATEST(0, output_tax − input_tax)
net_reclaimable   = GREATEST(0, input_tax − output_tax)   -- already returned on VAT reports
```

**Not GL.** Invoice posting credits `OVERSEAS_TAX_PAYABLE`. Flooring output and input **separately** is the defect: a period that is net reclaimable is still visible via `net_reclaimable`, but `total_tax_payable` cannot go negative and each side’s floor can hide a credit that should offset the other side **before** the net.

#### VAT Return Summary — `vat-return-summary`

**Defect:** `p_search` filters store tables; **`net_vat` recomputed without search**. Period 24.18 on Sales by Item ≠ BS tax **77.82** (cumulative control vs period documents). **Each tax side is floored with `GREATEST(0, …)` independently**; `net_reclaimable` exists so a refund is not wholly invisible.

**After:** `net_vat` from the same filtered set; footer **GL movement** of Overseas Tax Payable for the period vs document net.

#### VAT Return Details — `vat-return-details`

Line UNION of documents. Same `net_vat` object trap.

**Zoho:** Tax report vs tax payable control is a first-class recon.

---

### 7.10 Activity

#### Activity Log — `activity-logs`

**Wired to** `listActivityLogReportRows` (TS), **not** the SQL RPC on the hub path. Date = `audit_logs.created_at`. Limit **default 500, max 1000** (`Math.min(..., 1000)`; hub passes `limit: 500`). Search **after** fetch.

**After:** Server search + pagination. Not a financial statement.

#### Deleted Invoices — `deleted-invoices`

Cancelled invoices; period on cancel log. Not a GL reversal report.

---

## 8. Hub inventory (complete)

| # | Category | Title | Slug | RPC / source | Layer |
|---|----------|-------|------|--------------|-------|
| 1 | Business Overview | Balance Sheet | `balance-sheet` | `get_erp_trial_balance` | GL |
| 2 | Business Overview | Profit and Loss | `profit-and-loss` | `get_erp_profit_and_loss` | GL |
| 3 | Business Overview | Cash Flow Statement | `cash-flow-statement` | `get_erp_cash_flow_statement` | GL |
| 4 | Business Overview | Day Book | `day-book` | `get_erp_day_book` | All account lines |
| 5 | Business Overview | Finance Summary | `finance-summary` | `get_erp_financial_dashboard` + TB | Mixed |
| 6 | Sales | Daily Collection | `daily-collection-report` | `get_erp_daily_collection_report` | Subledger |
| 7 | Sales | Monthly Collection | `monthly-collection-report` | `get_erp_monthly_collection_report` | Subledger |
| 8 | Sales | Sales by Customer | `sales-by-customer` | `get_erp_sales_by_customer` | Ops + CN |
| 9 | Sales | Sales by Item | `sales-by-item` | `get_erp_sales_by_item` | Ops + CN/DC |
| 10 | Sales | Sales by Salesman | `sales-by-salesman` | `get_erp_sales_by_salesman` | Ops + CN |
| 11 | Sales | Credit Note Report | `credit-note-report` | `get_erp_credit_note_report` | Docs |
| 12 | Inventory | Minus Stock | `minus-stock` | `get_erp_minus_stock_report` | WAC |
| 13 | Inventory | Stock Report | `item-stock` | `get_erp_item_stock_report` | WAC |
| 14 | Inventory | Store Wise Stock | `store-wise-stock` | `get_erp_store_wise_stock_report` | WAC |
| 15 | Inventory | Dead Stock | `dead-stock` | `get_erp_dead_stock_report` | Estimate |
| 16 | Inventory | Stock Transfer | `stock-transfer-report` | `get_erp_stock_transfer_report` | Workflow |
| 17 | Purchases | Purchase By Item | `purchase-by-item` | `get_erp_purchase_by_item_report` | Bills+xfer |
| 18 | Purchases | Purchase By Vendor | `purchase-by-vendor` | `get_erp_purchase_by_vendor_report` | Bills+exp |
| 19 | Receivables | Customer Balance | `customer-balance` | `get_erp_customer_balance_report` | Subledger |
| 20 | Receivables | Aging Summary | `customer-aging-summary` | `get_erp_customer_aging_summary_counts` | Subledger |
| 21 | Receivables | Aging Details | `customer-aging-details` | `get_erp_customer_aging_details` | Subledger |
| 22 | Receivables | Aging Summary Values | `customer-aging` | `get_erp_customer_aging` | Subledger |
| 23 | Payments Received | Payments Received | `payments-received` | `get_erp_payments_received_report` | Cash |
| 24 | Payables | Vendor Balance | `vendor-balance` | `get_erp_vendor_balance_report` | Subledger |
| 25 | Payables | PB Aging Summary | `vendor-aging-summary` | `get_erp_vendor_aging_summary_counts` | Subledger |
| 26 | Payables | PB Aging Details | `vendor-aging-details` | `get_erp_vendor_aging_details` | Subledger |
| 27 | Payables | PB Aging Summary Values | `vendor-aging` | `get_erp_vendor_aging` | Subledger |
| 28 | Accountant | Trial Balance | `trial-balance` | `get_erp_trial_balance` | GL |
| 29 | Accountant | General Ledger | `general-ledger` | `get_erp_general_ledger_summary` | GL |
| 30 | Accountant | Account Transactions | `account-transactions` | `get_erp_account_transaction_report` | GL |
| 31 | Taxes | VAT Return Summary | `vat-return-summary` | `get_erp_vat_return_summary_report` | Documents |
| 32 | Taxes | VAT Return Details | `vat-return-details` | `get_erp_vat_return_details_report` | Documents |
| 33 | Activity | Activity Log | `activity-logs` | `listActivityLogReportRows` | Audit |
| 34 | Activity | Deleted Invoices | `deleted-invoices` | `get_erp_deleted_invoices_report` | Audit |
| — | Drill-down | Aging Summary Details | `customer-aging-summary-details` | `get_erp_customer_aging_summary_customer_details` | Subledger |
| — | Drill-down | PB Aging Summary Details | `vendor-aging-summary-details` | `get_erp_vendor_aging_summary_vendor_details` | Subledger |
| — | Nav (not hub) | Payments Made | `/admin/erp/supplier-payments` | `erp-supplier-payments.service.ts` | Cash+AP |

---

## 9. Critical issue register (implementation backlog)

Prioritize in a later code pass. This file does not implement them.

### P0

| ID | Issue | After |
|----|--------|--------|
| BS-1 | Assets ≠ L+E | Current year earnings + presentation signs |
| CF-1 | Cash flow WC uses +Δ on raw liability/AP/equity D−C | `−Δ` on every non-cash BS account; keep indirect headline |
| CF-2 | `net_change` vs cash GL; `net_change_reconciled` unused | Hard check; banner; no plug |
| CF-3 | `Goods Receipt Pending` omitted from cash-flow section map | Map GRNI (and all BS types) |
| TB-SQL | `AS period_credit, 4` at `20260829230000` line 47 — invalid SQL | Replacement migration; live ≠ repo |
| FS-AR | AR KPI 0 vs GL −105.39; period sales−cash−discount-row = 44.61 **unexplained vs GL** | Dual KPI + recon; do not fake a close |
| FS-AP | AP KPI 105 vs GL −86.6 | Dual KPI + recon; include TOKIN −18.4 |
| SBI-DC | Screenshot row `Sales discount` via CN `product_name` union (**pushed**). Synthetic DC insert **[not on origin]** | Stop listing non-product CN lines as SKUs; `credit_kind` filter only after that column is pushed |
| CB-1 | Customer Balance ignores unallocated vs GL AR (**pushed**). DC AR journals **[not on origin]** | Partner ledger: opening + invoice due − unallocated |
| VB-1 | Three AP definitions | One primary open-balance; label the rest |

### P1

| ID | Issue |
|----|--------|
| DATE-1 | Session date bar vs per-report preset |
| DATE-2 | Collection reports on `created_at` |
| STORE-1 | Product is store-scoped; SQL still includes `je.store_id IS NULL` + global openings |
| STORE-2 | Report Store dropdown includes **All stores** — remove the filter entirely |
| STORE-3 | Receivables + activity-logs skip `activeStoreId` (open unscoped) |
| STORE-4 | Store Wise Stock ignores store (`filters: {}`) |
| DAY-1 | Day Book not Cash/Bank |
| FS-REV | “Revenue” = total income including Discount Received |
| FS-ASOF | Position `asOf` vs period end |
| SM-1 | Salesman inner join drops **all** CNs without `source_invoice_id` (pushed; not DC-specific) |
| SM-COGS | Item vs salesman credit COGS helpers differ (pushed) |
| CN-1 | Credit Note `status <> cancelled` includes drafts (pushed). `credit_kind` UI **[not on origin]** |
| CB-DRAFT | Customer Balance includes draft/pending invoices |
| PAY-R | Payments Received omits settlement |
| PAY-M | Payable KPI positive-only; not on hub |
| PBV-1 | Purchase by vendor ignores credit amounts |
| AGE-1 | Aging `total_due` ignores `available_credit` |
| TB-1 | Lifetime columns named period |
| TB-HAVING | TB HAVING ignores store filter |
| PL-COGS | P&L COGS matched by type **name** string |
| FS-LOW | Finance dashboard RPC `low_stock_count` reads `public.inventory`, not SPI; store snapshot path forces 0 |
| VAT-1 | Document VAT vs Overseas Tax Payable; search vs `net_vat` |
| STK-1 | WAC reports vs GL STOCK unlabeled |
| XFER-1 | Fake transfer payments |
| PREC-1 | ROUND 2 vs display 3 |
| ERP-YE | Missing Year-End Retained Earnings roll-over |
| ERP-STMT| Missing Customer/Vendor Statement of Account (Running Ledger) |
| ERP-BASIS| Missing Accrual vs Cash reporting basis toggle |

### P2

| ID | Issue |
|----|--------|
| X-FILTER | Search-filtered footers |
| MINUS-1 | `shortage_qty` exists; purchase value still negative |
| DEAD-1 | Estimated lots |
| SWS-1 | Store-wise SQL stale |
| ACT-1 | Activity default 500 / max 1000 |
| PL-ZERO | Hidden zero P&L accounts |

---

## 10. Recommended hierarchy (spec for later UI)

Badge every report **GL / Subledger / Operational**.

1. **Financial statements:** Trial Balance → P&L → Balance Sheet (earnings + balanced) → Cash Flow (reconciled) → Day Book (cash/bank).
2. **Position:** Finance Summary (GL KPIs + subledger recon strip) → Customer ledger → Vendor ledger → Aging.
3. **Sales analysis:** By item (**SKUs only**) → By customer → By salesman → Credit notes → Payments received (cash + settlement). Splitting commercial discounts is **policy / untracked DC**, not a pushed-schema requirement.
4. **Purchases:** By vendor (net of credits) → By item (bills vs transfers) → Payments made (on the hub).
5. **Inventory:** On-hand at WAC + GL STOCK recon → Minus stock (positive shortage) → Transfers as movements → Dead stock labeled estimate.
6. **Tax / Activity:** VAT period vs tax control; audit logs.

Do not collapse GL and subledger into one number to “make it look nice.” If they differ, show both and the reconciling items (unallocated cash, GRNI, uncosted sales; DC AR only if that posting exists in the deployed DB).

---

## 11. What this analysis did not certify

- No disposable DB run of Scenarios A–G.
- `ACCOUNTING_INTEGRATION=1 npm run erp:accounting:validate` not executed.
- Screenshot numbers are **illustrative of live Store A data on 2026-10-22**, mixed presets. Formulas are from source; penny-perfect production sign-off still needs a single frozen period and posted journals.
- **Open unknowns:** KPI profit **−104.117** vs rows **−104.17**; AR reconstruction **44.61** vs GL **−105.39**. Do not invent adjustments.
- **Not on origin/master:** `credit_kind`, `record_erp_commercial_discount`, `DISCOUNT_ALLOWED` / `DISCOUNT_RECEIVED`, synthetic `'Sales discount'` line insert, `20261022130000`. Those are local untracked files; live DB was not inspected.
- **Policy (not errors):** discount vs gross profit placement; fiscal-year boundary for Current year earnings.
- **Store scope:** always the header active store. **All stores must not be a report filter.** NULL-store journal inclusion is a leak, not consolidation.

**Next step (out of scope here):** implement P0 items in SQL/UI with 3 dp policy, then E2E validate one store/period until BS balances, cash flow reconciles, AR/AP KPI = partner ledger = GL ± documented recon items, and Sales by Item contains only products.

---

*End of analysis. No application code or migrations were changed.*
