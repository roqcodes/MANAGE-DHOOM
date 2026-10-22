# BUYHUB reports — production readiness vs Zoho / Odoo

**Date:** 2026-10-22  
**Verdict:** **PASS** (repo code; all audited critical money/store-isolation issues addressed)

**Method:** Hub category reviews vs Zoho Books / Odoo 17; P0–P2 migrations; re-audit of remaining FAIL items; fixes in `20261022200000`.

**Live DB:** Apply `20180000` → `22170000` → `22180000` → `22190000` → **`22200000`**. Until then production still runs older RPCs.

---

## Module scorecard (after `22200000`)

| Module | Verdict | Why |
|--------|---------|-----|
| Business Overview | **PASS** | Store-strict TB/P&L/CF; day book store access + store-scoped running balance |
| Accountant | **PASS** | Closing Dr/Cr TB; GL store-only; AR/AP recon |
| Sales | **PASS** | Store-strict sales-by-customer; SKU sales-by-item; salesman LEFT JOIN CNs; issued invoice statuses |
| Inventory | **PASS** | SPI WAC; item/dead stock SQL store required; transfer paid = completed transfer; STOCK vs WAC |
| Purchases | **PASS** | Store + landed + vendor net of credits |
| Receivables / Payments | **PASS** | Issued statuses; statements; party store opening; aging summary/details SQL store required |
| Payables | **PASS** | Store openings; aging net unallocated; vendor statement; aging SQL store required |
| Taxes / Activity | **PASS** | VAT `net_vat` from filtered rows; details/KPIs sign credit notes; activity search before limit |

---

## Critical bar (PASS means)

1. One store: SQL rejects null store; journals with `store_id IS NULL` do not leak.
2. TB as-of is closing Dr or Cr of net.
3. Balance sheet A = L + E; cash flow `net_change` vs cash movement is checked.
4. Sales by item is SKUs; salesman includes standalone CNs; sales invoices `issued/partial/paid/overdue`.
5. AR/AP issued docs; unallocated nets; statements with running balance; store party openings.
6. Inventory on `store_product_inventory`; transfer paid follows completed `erp_store_transfers`.
7. Purchases store-strict; vendor net; landed in item value.
8. Control recon: AR/AP vs subledger; STOCK vs WAC.
9. VAT footer/KPIs match the filtered (and signed-adjustment) lines.

---

## Fixes in `22200000` (re-audit)

| ID | Fix |
|----|-----|
| DAY | Day book `require_store_access`; running balance = store opening + period window |
| SALE-CUST | Sales by customer store required; issued statuses |
| SALE-STAT | Item/salesman/collection RPCs use issued allowlist |
| INV-SQL | Item stock and dead stock raise if store missing |
| AGE-SQL | Customer/vendor aging summary, details, drill-down store required |
| XFER | `payment_paid` only when a completed store transfer exists |
| VAT-UI | Credit note / vendor credit VAT signed in KPIs, rows, and totals |

---

## Not required for this PASS

| Item | Why |
|------|-----|
| Fiscal year close posting | Close process, not a hub report |
| Accrual / cash P&L toggle | P&L is journal (accrual); collections show cash |
| Live migrate | Operator step; listed in apply order |

---

## Apply order

1. `20261020180000_report_salesman_filter.sql`
2. `20261022170000_reports_p0_store_strict.sql`
3. `20261022180000_reports_production_hardening.sql`
4. `20261022190000_reports_statements_recon.sql`
5. `20261022200000_reports_reaudit_fixes.sql`
