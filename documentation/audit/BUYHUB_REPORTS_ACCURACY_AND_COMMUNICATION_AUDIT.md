# BUYHUB ERP — Reports Accuracy & Professional Communication Audit

**Audit date:** 2026-10-20  
**Scope:** DHOOM-MANAGE Reports module (`/admin/erp/reports`)  
**Method:** Source-code and SQL migration review only. **No runtime tests against a live database** were executed. **No application code or data was modified** for this audit.  
**Zoho Books benchmark:** Compared conceptually to standard Zoho Books report naming and P&L structure (Income → COGS → Gross Profit → Expenses → Net Profit). Live Zoho UI was not exercised in this session; references are to commonly documented Zoho Books behavior.

---

## 1. Executive Summary

### Overall readiness: **Not Ready** (for finance-led decision-making without a written “report dictionary”)

BUYHUB exposes **37 report experiences** (35 on the Reports hub plus 2 aging drill-down routes). The module is broad and usable for operations (stock, aging, payments, VAT lines), but **several high-visibility financial metrics use formulas or labels that do not match what a bookkeeper would expect from Zoho Books or from other reports in the same product**.

### Top risks (business impact)

| ID | Severity | Summary |
|----|----------|---------|
| RPT-P0-001 | **P0** | **Finance Summary (all stores)** treats **purchase bill totals** as `cogs_ytd` and computes `net_profit_ytd = invoice_sales − purchases − expenses` — not recognized COGS and not aligned with P&L. |
| RPT-P0-002 | **P0** | **P&L / dashboard “net profit”** is **posted Income − Expense** with **no automatic sale COGS** in GL (`post_journal_for_invoice` does not post COGS/Stock). Users can confuse this with **sales report “recognized profit”** (operational margin). |
| RPT-P1-003 | **P1** | **Sales profitability reports** (pre–uncosted migration) could show **full revenue as profit** when unit cost is zero; **UI labels for uncosted columns depend on migration `20261020140000_*` being applied**. |
| RPT-P1-004 | **P1** | **Balance Sheet** report uses **`get_erp_trial_balance`** (same RPC as Trial Balance), not a dedicated balance-sheet layout; client-side search **recalculates section totals on filtered rows only**. |
| RPT-P1-005 | **P1** | **Sales reports** filter on **`invoices.created_at::date`**, not invoice/issue date fields; cross-report date alignment with P&L (**`journal_entries.transaction_date`**) is not guaranteed. |
| RPT-P1-006 | **P1** | **Sales by Customer / Item** do not net **credit notes**; **Sales by Salesman** subtracts CN **tax-inclusive** totals from **ex-tax** profit math. |

### Positive notes

- Receivables/payables aging, payments received, and many inventory RPCs are explicit about open balances and statuses in `report-types.ts` descriptions.
- Sales hub reports gained footnotes and **recognized profit / pending cost** column labels in UI (`sales-report.tsx`, `report-types.ts`) — **authoritative only after** uncosted migration is deployed.
- Tabular exports use the same filtered row set as the grid (`sales-tabular-report.tsx` → `buildReportExportSource` → `getRows: () => sorted`).
- Store-scoped Finance Summary uses **`get_erp_profit_and_loss`** via `getStoreFinancialDashboard` (`erp-finance-dashboard.service.ts`), which is more defensible than the global RPC.

---

## 2. Complete Reports Inventory

**Hub route:** `/admin/erp/reports` (`reports-hub-view.tsx`)  
**Report route pattern:** `/admin/erp/reports/[slug]` (`app/admin/erp/reports/[slug]/page.tsx`)  
**API:** `GET` via `buildErpReportApiPath` → `runErpReport` (`erp-reports.service.ts`, `app/api/admin/erp/reports/route.ts`)

| # | UI title | Slug | Route | Category | Primary RPC / source | Exports |
|---|----------|------|-------|----------|----------------------|---------|
| 1 | Balance Sheet | `balance-sheet` | `/admin/erp/reports/balance-sheet` | Business Overview | `get_erp_trial_balance` | CSV/XLSX/PDF via layout when wired |
| 2 | Profit and Loss | `profit-and-loss` | `/admin/erp/reports/profit-and-loss` | Business Overview | `get_erp_profit_and_loss` | Same |
| 3 | Cash Flow Statement | `cash-flow-statement` | `/admin/erp/reports/cash-flow-statement` | Business Overview | `get_erp_cash_flow_statement` | Custom UI |
| 4 | Day Book | `day-book` | `/admin/erp/reports/day-book` | Business Overview | `get_erp_day_book` | Tabular |
| 5 | Finance Summary | `finance-summary` | `/admin/erp/reports/finance-summary` | Business Overview | `get_erp_financial_dashboard` **or** `getStoreFinancialDashboard` | **No export menu** on layout |
| 6 | Daily Collection Report | `daily-collection-report` | `/admin/erp/reports/daily-collection-report` | Sales | `get_erp_daily_collection_report` | Tabular |
| 7 | Monthly Collection Report | `monthly-collection-report` | `/admin/erp/reports/monthly-collection-report` | Sales | `get_erp_monthly_collection_report` | Tabular |
| 8 | Sales by Customer | `sales-by-customer` | `/admin/erp/reports/sales-by-customer` | Sales | `get_erp_sales_by_customer` | Tabular |
| 9 | Sales by Item | `sales-by-item` | `/admin/erp/reports/sales-by-item` | Sales | `get_erp_sales_by_item` | Tabular |
| 10 | Sales by Salesman | `sales-by-salesman` | `/admin/erp/reports/sales-by-salesman` | Sales | `get_erp_sales_by_salesman` | Tabular |
| 11 | Credit Note Report | `credit-note-report` | `/admin/erp/reports/credit-note-report` | Sales | `get_erp_credit_note_report` | Tabular |
| 12 | Minus Stock Report | `minus-stock` | `/admin/erp/reports/minus-stock` | Inventory | `get_erp_minus_stock_report` | Tabular |
| 13 | Stock Report | `item-stock` | `/admin/erp/reports/item-stock` | Inventory | `get_erp_item_stock_report` | Tabular |
| 14 | Store Wise Stock | `store-wise-stock` | `/admin/erp/reports/store-wise-stock` | Inventory | `get_erp_store_wise_stock_report` | Tabular |
| 15 | Dead Stock | `dead-stock` | `/admin/erp/reports/dead-stock` | Inventory | `get_erp_dead_stock_report` | Tabular |
| 16 | Stock Transfer Report | `stock-transfer-report` | `/admin/erp/reports/stock-transfer-report` | Inventory | `get_erp_stock_transfer_report` | Tabular |
| 17 | Purchase By Item | `purchase-by-item` | `/admin/erp/reports/purchase-by-item` | Purchases and Expenses | `get_erp_purchase_by_item_report` | Tabular |
| 18 | Purchase By Vendor | `purchase-by-vendor` | `/admin/erp/reports/purchase-by-vendor` | Purchases and Expenses | `get_erp_purchase_by_vendor_report` | Tabular |
| 19 | Customer Balance | `customer-balance` | `/admin/erp/reports/customer-balance` | Receivables | `get_erp_customer_balance_report` | Tabular |
| 20 | Aging Summary | `customer-aging-summary` | `/admin/erp/reports/customer-aging-summary` | Receivables | `get_erp_customer_aging_summary_counts` | Tabular |
| 21 | Aging Details | `customer-aging-details` | `/admin/erp/reports/customer-aging-details` | Receivables | `get_erp_customer_aging_details` | Tabular |
| 22 | Aging Summary Values | `customer-aging` | `/admin/erp/reports/customer-aging` | Receivables | `get_erp_customer_aging` | Tabular |
| 23 | Payments Received | `payments-received` | `/admin/erp/reports/payments-received` | Payments Received | `get_erp_payments_received_report` | Tabular |
| 24 | Vendor Balance | `vendor-balance` | `/admin/erp/reports/vendor-balance` | Payables | `get_erp_vendor_balance_report` | Tabular |
| 25 | PB Aging Summary | `vendor-aging-summary` | `/admin/erp/reports/vendor-aging-summary` | Payables | `get_erp_vendor_aging_summary_counts` | Tabular |
| 26 | PB Aging Details | `vendor-aging-details` | `/admin/erp/reports/vendor-aging-details` | Payables | `get_erp_vendor_aging_details` | Tabular |
| 27 | PB Aging Summary Values | `vendor-aging` | `/admin/erp/reports/vendor-aging` | Payables | `get_erp_vendor_aging` | Tabular |
| 28 | Trial Balance | `trial-balance` | `/admin/erp/reports/trial-balance` | Accountant | `get_erp_trial_balance` | Tabular |
| 29 | General Ledger | `general-ledger` | `/admin/erp/reports/general-ledger` | Accountant | `get_erp_general_ledger_summary` (+ drill `get_erp_general_ledger`) | Tabular |
| 30 | Account Transactions | `account-transactions` | `/admin/erp/reports/account-transactions` | Accountant | `get_erp_account_transaction_report` | Tabular |
| 31 | VAT Return Summary | `vat-return-summary` | `/admin/erp/reports/vat-return-summary` | Taxes | `get_erp_vat_return_summary_report` | Custom (`taxes-report.tsx`) |
| 32 | VAT Return Details | `vat-return-details` | `/admin/erp/reports/vat-return-details` | Taxes | `get_erp_vat_return_details_report` | Custom |
| 33 | Activity Log | `activity-logs` | `/admin/erp/reports/activity-logs` | Activity | `get_erp_activity_log_report` | Tabular |
| 34 | Deleted Invoices | `deleted-invoices` | `/admin/erp/reports/deleted-invoices` | Activity | `get_erp_deleted_invoices_report` | Custom expand rows |
| 35 | Aging Summary Details (customer) | `customer-aging-summary-details` | `/admin/erp/reports/customer-aging-summary/[customerId]` | Receivables (drill) | `get_erp_customer_aging_summary_customer_details` | Tabular |
| 36 | PB Aging Summary Details (vendor) | `vendor-aging-summary-details` | `/admin/erp/reports/vendor-aging-summary/[vendorId]` | Payables (drill) | `get_erp_vendor_aging_summary_vendor_details` | Tabular |

**Related but outside Reports hub**

- **Admin dashboard** KPI “Net profit (YTD)” uses `getFinancialDashboard()` / store snapshot (`admin-dashboard-view.tsx`, `erp-finance-dashboard.service.ts`) — must reconcile with Finance Summary and P&L.
- **Legacy `report-viewer.tsx`** still references `cogs_ytd` / `net_profit_ytd` fields — verify no production route still uses it for Finance Summary.

**Report router map:** `inventory-report.tsx`, `sales-report.tsx`, `purchases-report.tsx`, `receivables-report.tsx`, `payables-report.tsx`, `payments-payables-report.tsx`, `accountant-report.tsx`, `taxes-report.tsx`, `activity-report.tsx`, `business-overview-report.tsx`.

---

## 3. How Each Report Works (summary by category)

### Shared infrastructure

| Layer | Behavior |
|-------|----------|
| **Definitions** | `src/common/erp/report-types.ts` — slug, RPC name, columns, filter flags |
| **Fetch** | `use-erp-report-fetch.ts` → API → `runErpReport` |
| **Dates** | `resolveReportDateBounds` — empty from/to → `2000-01-01` .. today; default month-to-date if params omitted |
| **Exports** | `DataExportMenu` + `exportFromSource` — tabular reports export **client-filtered** `sorted` rows |
| **KPI footer** | `report-summaries.ts` — sums numeric columns on **filtered** rows; averages `%` columns |

### A. Financial / Business Overview

| Report | Business question | Source | Key formula | Status / dates |
|--------|-------------------|--------|-------------|----------------|
| **P&L** | Posted revenue & expense by account | `get_erp_profit_and_loss` | Income: Σ(credit−debit) on Income accounts; Expense: Σ(debit−credit) on **Expense** category; `net_profit = income − expenses` | `je.status = 'posted'`, `transaction_date` in range; store filter includes `je.store_id IS NULL` |
| **Balance Sheet** | Assets = Liabilities + Equity | **Same** `get_erp_trial_balance` as TB | UI partitions `account_category` into assets/liabilities/equity (`balance-sheet-report.tsx`, `report-format.ts`) | **As-of** `p_as_of` |
| **Trial Balance** | Net debits/credits per account | `get_erp_trial_balance` | `period_debit`, `period_credit`, `balance` | As-of |
| **Finance Summary** | Snapshot AR/AP + position + profit | All stores: `get_erp_financial_dashboard`; with store: `getStoreFinancialDashboard` | **Global RPC:** `cogs_ytd = SUM(erp_purchase_bills.total_amount)`; `net_profit_ytd = invoice_income − cogs_ytd − expenses` (`20260902170000_…sql` L31–61). **Store path:** P&L `net_profit`, `cogs_ytd: 0` hard-coded in TS (`erp-finance-dashboard.service.ts` L286–295) | Global YTD from calendar year start; store path respects selected date range for P&L |
| **Cash Flow** | Indirect cash flow | `get_erp_cash_flow_statement` | Uses P&L `net_profit` as starting point (`20261014102000_erp_cash_flow_statement.sql`) | Period |
| **Day Book** | Cash/bank movements | `get_erp_day_book` | Posted lines on cash/bank accounts | Period |

**COGS / inventory GL:** Documented in `erp_posting_rules` — invoice posts **AR, Income, tax** only; **“COGS/Stock not posted”** (`20260823220000_phase5_accounts_vat_banking.sql`).

### B. Sales

| Report | Revenue basis | Cost / profit | Credit notes | Date field |
|--------|---------------|---------------|--------------|------------|
| **Sales by Customer** | `SUM(invoices.subtotal)`, `total_amount` | **After migration `20261020140000`:** `erp_invoice_item_margin_components` → `purchase_cost`, `uncosted_revenue`, `net_profit` (recognized). **Before:** `erp_invoice_line_unit_cost × qty`; zero cost → profit ≈ subtotal | Not included | `i.created_at::date` |
| **Sales by Item** | `SUM(ii.total_amount)` (incl. tax) | Recognized profit on **taxable** base in margin function; **Sales column is tax-inclusive** | Not included | `created_at::date` |
| **Sales by Salesman** | Invoice totals + ex-tax subtotal | Recognized profit; subtracts `credit_note_total` (tax-inclusive CN) from recognized profit | Partial (revenue only) | `created_at::date` |
| **Daily/Monthly Collection** | Invoices + payments by mode | Not margin reports | Per RPC | Period |
| **Credit Note Report** | CN lines | N/A | Source of truth for CN period | CN date |

### C. Purchasing

| Report | Measures | COGS? |
|--------|----------|-------|
| **Purchase by Item** | Bill + inbound transfer qty/value | **Purchases**, not sale COGS |
| **Purchase by Vendor** | Expenses + bills + vendor credits | **Purchases/AP activity** |

### D. Inventory

| Report | Valuation |
|--------|-----------|
| **Stock / Store wise / Minus** | `stock × COALESCE(spi.purchase_price, product.purchase_price)` (WAC on SPI when set) |
| **Dead stock** | Expired lots; estimated qty from bill/receive lineage |
| **Stock transfer** | Request workflow qty/value |

**Costing policy (inventory):** Weighted average on **receipt** (`store_product_inventory_apply_receipt_cost`, `20261001140000_landed_cost_wac_costing.sql`). **Not FIFO layers.**

**Uncosted sales backfill (pending deployment):** `erp_allocate_receipt_cost_to_pending_sales` on receipt (`20261020140000_uncosted_sales_profit_reporting.sql`).

### E. Receivables / Payables / Payments / Taxes / Activity

- **Balances & aging:** RPCs documented in migrations `20261015250000_receivables_payables_show_all_rows.sql` and aging family — open documents, bucket by age, as-of date.
- **Payments Received:** Customer payments in period (cash collection), not revenue recognition.
- **VAT:** Output/input VAT from invoices, CN, bills, vendor credits in period.
- **Activity / Deleted invoices:** Audit and cancelled invoice listing — not financial totals.

---

## 4. Critical and High Findings (P0 / P1)

### RPT-P0-001 — Finance Summary (all stores) mislabels purchases as COGS

| Field | Detail |
|-------|--------|
| **Severity** | P0 |
| **Report** | Finance Summary (`/admin/erp/reports/finance-summary`) |
| **Evidence** | `get_erp_financial_dashboard` (`20260902170000_fix_financial_dashboard_reorder_point.sql` L36–39, L55–61): `v_cogs` = SUM(`erp_purchase_bills.total_amount`); `net_profit_ytd` = `v_income - v_cogs - v_expenses`. Legacy UI fields in `report-viewer.tsx` L57–59. |
| **Scenario** | Buy ₹500k stock in January; sell ₹300k in February. Dashboard shows huge “COGS” from purchases and deeply negative “net profit” while P&L shows positive posted income. |
| **Expected (Zoho-like)** | COGS reflects **cost of goods sold**, not purchase volume; gross profit = income − COGS. |
| **Actual** | Purchase bill totals subtracted from sales invoice totals. |
| **Impact** | Management may throttle purchasing or believe the business is loss-making when cash/P&L differ. |
| **Verified** | Inferred from SQL (not run live). |
| **Fix** | Rename metrics (`purchases_ytd`); compute net profit from P&L only; or add explicit non-GAAP panel. **Store-filtered path already uses P&L** (`erp-finance-dashboard.service.ts`). |
| **Also affects** | Admin dashboard when using global `getFinancialDashboard()`. |

### RPT-P0-002 — P&L “Net profit” is not merchandise gross profit

| Field | Detail |
|-------|--------|
| **Severity** | P0 (communication); P2 if users are trained |
| **Report** | Profit and Loss; Admin dashboard net profit link |
| **Evidence** | `get_erp_profit_and_loss` — Income vs Expense only (`20260903230000_fix_profit_and_loss_date_filter.sql`). `post_journal_for_invoice` — no COGS (`phase5` posting rules). |
| **Scenario** | Retailer with 40% margin: P&L shows full sales income in Income, **no automatic COGS**, net profit ≈ sales − opex — **overstates operating profit** vs margin reports. |
| **Expected** | Zoho P&L separates **COGS** and **Gross Profit** when inventory accounting is enabled. |
| **Actual** | COGS only if manually posted to Expense/COGS accounts. |
| **Impact** | Conflicts with Sales by Customer “recognized profit” after uncosted fix. |
| **Verified** | Inferred from SQL + posting rules. |
| **Fix** | Banner on P&L: “Accrual accounts only; excludes automatic sale COGS.” Align dashboard KPI label with P&L definition. |

### RPT-P1-003 — Uncosted sales profit (deployment-dependent)

| Field | Detail |
|-------|--------|
| **Severity** | P1 (P0 if migration not applied in test env) |
| **Report** | Sales by Customer / Item / Salesman |
| **Evidence** | Pre-fix: `20261019240000_fix_sales_report_profit_cost.sql` — profit = subtotal − `erp_invoice_line_unit_cost×qty`; cost 0 → full margin. Post-fix: `20261020140000_uncosted_sales_profit_reporting.sql` + UI columns in `report-types.ts` L238–240. Footnote `sales-report.tsx`. |
| **Scenario** | Sell 20 @ ₹10 with no catalog cost and negative stock — **before migration:** profit ₹200. **After migration:** recognized profit ₹0, pending cost revenue ₹200. |
| **Verified** | Unit tests on margin math (`invoice-line-profit-metrics.test.ts`); SQL not executed on DB. |
| **Impact** | False profitability in testing until migration applied. |
| **Fix** | Apply migration; verify RPC returns `uncosted_revenue`. |

### RPT-P1-004 — “Balance Sheet” uses Trial Balance RPC; search skews totals

| Field | Detail |
|-------|--------|
| **Severity** | P1 |
| **Report** | Balance Sheet (`balance-sheet-report.tsx`) |
| **Evidence** | `report-types.ts` L63–69: `rpc: "get_erp_trial_balance"`. L53–54: `partitionBalanceSheetRows(filtered)` after search filter. |
| **Scenario** | User searches “Cash” — asset/liability **section totals** reflect only matching accounts, not the real balance sheet. |
| **Expected** | Zoho balance sheet shows full totals; search is navigation, not recalculation. |
| **Verified** | Inferred from React code. |

### RPT-P1-005 — Sales report date = `created_at`, not invoice date

| Field | Detail |
|-------|--------|
| **Severity** | P1 |
| **Report** | All `get_erp_sales_by_*` RPCs |
| **Evidence** | `20261019240000_fix_sales_report_profit_cost.sql` — `i.created_at::date BETWEEN p_date_from AND p_date_to` |
| **Scenario** | Invoice issued last day of month but created next day — lands in wrong period vs P&L posting date. |
| **Impact** | Sales reports ≠ P&L income for same calendar filter. |

### RPT-P1-006 — Credit notes inconsistent across sales reports

| Field | Detail |
|-------|--------|
| **Severity** | P1 |
| **Report** | Sales by Customer, Item (excluded); Salesman (subtracts CN total) |
| **Evidence** | Salesman `credit_stats` CTE in `20261020140000_…sql`; customer/item aggregations invoice-only. |
| **Scenario** | Returns in period — customer report overstates net sales vs salesman report. |
| **Impact** | Cross-report disagreement. |

### RPT-P1-007 — Sales by Item: mixed tax bases in columns

| Field | Detail |
|-------|--------|
| **Severity** | P1 |
| **Report** | Sales by Item |
| **Evidence** | `total_amount` includes tax; margin components use `taxable_amount` (`erp_invoice_item_margin_components`) |
| **Scenario** | User subtracts “Sales − COGS” mentally using displayed columns — mismatch with tax. |
| **Fix** | Add ex-tax sales column or label “Sales (incl. tax)” prominently. |

### RPT-P1-008 — Finance Summary: store filter changes profit definition

| Field | Detail |
|-------|--------|
| **Severity** | P1 |
| **Report** | Finance Summary |
| **Evidence** | `runErpReport` L138–145: store → `getStoreFinancialDashboard` (P&L); no store → `get_erp_financial_dashboard` (purchases as COGS) |
| **Impact** | Same report name, incompatible formulas. |

---

## 5. Medium and Low Findings (P2 / P3)

| ID | Sev | Finding |
|----|-----|---------|
| RPT-P2-001 | P2 | **P&L** has no **Gross Profit** line; Zoho users expect Income → COGS → Gross Profit → Expenses. |
| RPT-P2-002 | P2 | **Finance Summary** has no CSV/PDF export of KPI cards (`FinanceSummaryReport` — no `exportSource`). |
| RPT-P2-003 | P2 | **Sales by Customer** splits rows by **`i.source` (channel)** — one customer appears twice. |
| RPT-P2-004 | P2 | **Profit %** on sales reports uses denominator **excluding uncosted revenue** only after migration; label does not explain formula. |
| RPT-P2-005 | P2 | **Global finance dashboard** ignores **store filter** on income/COGS (RPC has no `p_store_id`). |
| RPT-P2-006 | P2 | **Dead stock** described as estimated qty — good honesty; easy to misread as physical count. |
| RPT-P2-007 | P2 | **Minus stock** “purchase value” on negative qty can be misleading (valuation × negative). |
| RPT-P3-001 | P3 | Hub category hints helpful; individual reports lack per-metric tooltips (Zoho often has help text). |
| RPT-P3-002 | P3 | PDF export branding improved (`tabular-pdf.ts`) — ensure column headers match on-screen renames (COGS recognized). |

---

## 6. Cross-Report Reconciliation Matrix

| Pair | Should agree? | Actual relationship |
|------|---------------|---------------------|
| Sales by Customer **net sales** vs **Payments Received** | No — accrual vs cash | Different purpose; document in training. |
| Sales by Customer **net sales** vs P&L **Income** | Approximate if same period, store, channel, dates | **No** — P&L = posted journals; sales = invoices `created_at`; CN handling differs. |
| Sales **recognized profit** vs P&L **net profit** | No | P&L excludes automatic COGS; sales margin is operational. |
| Finance Summary **net profit** (global) vs P&L | **Should** | **No** — purchases formula vs journals. |
| Finance Summary **net profit** (store) vs P&L | Yes | **Yes** — same `get_erp_profit_and_loss` path. |
| Customer Balance **total_receivable** vs AR account | Should | Verify with `get_account_balance` — not re-run in audit. |
| Trial Balance vs Balance Sheet (same as-of) | Same underlying RPC | **Yes** — same `get_erp_trial_balance`; different presentation. |
| Stock Report **value at cost** vs Store Wise Stock | Approximate | Same SPI WAC logic family. |
| Purchase by Vendor **bill_amount** vs Finance Summary **cogs_ytd** | Users may expect | **Related but not equal** — vendor report is period/vendor scoped; dashboard COGS is YTD all bills. |
| Report grid **footer totals** vs **export** | Yes | **Yes** — same `sorted` rows (`sales-tabular-report.tsx`). |
| Report grid vs **KPI strip** | Yes | **Yes** — both from filtered `sorted` (`report-summaries.ts`). |

---

## 7. Zoho Books Communication Benchmark

| Topic | Zoho Books (typical) | BUYHUB today | Recommendation type |
|-------|----------------------|--------------|-------------------|
| P&L structure | Income, COGS, Gross Profit, Operating Expense | Income + Expense only | **Label + doc** (not wrong if COGS not posted) |
| COGS | From inventory/accounting settings | Purchases used as COGS on global dashboard | **Incorrect label (P0)** |
| Sales vs Collections | Separate reports | Daily/Monthly Collection vs Sales reports | **OK** — clarify in hub text |
| Profit on sales | Often gross margin per item | Recognized profit + pending cost (post-migration) | **Good direction** — deploy + train |
| Balance Sheet | Standard sections, balanced totals | Trial balance accounts partitioned in UI | **Rename or document** |
| Pending / draft | Usually excluded from financials | Sales RPCs exclude `cancelled`, `pending` | **OK** — verify `draft` status handling per RPC |
| Export | Matches screen | Tabular exports match filtered data | **OK** |

*Official Zoho help pages were not fetched in this audit; comparisons are based on widely published Zoho Books report structures.*

---

## 8. Recommended Fix Order (smallest safe first)

1. **Rename / relabel** Finance Summary global metrics (`purchases_ytd`, document formula) — no GL change.
2. **Apply** `20261020140000_uncosted_sales_profit_reporting.sql` in test; verify sales RPC columns populate.
3. **Add P&L / dashboard disclaimers** (posted accounts; no auto sale COGS).
4. **Balance Sheet:** compute totals from full `rows`, filter only display — or disable search affecting totals.
5. **Align sales date** filter to `issued_at` or document `created_at` in banner.
6. **Credit notes** in customer/item sales aggregations (narrow SQL change).
7. **Finance Summary export** (optional P2).
8. **GL COGS policy** — separate project; requires accounting sign-off before posting.

---

## 9. Testing Evidence and Limitations

| Activity | Result |
|----------|--------|
| SQL / TypeScript code review | Completed across `report-types.ts`, `erp-reports.service.ts`, key migrations, report components |
| Live database / RPC execution | **Not performed** |
| Zoho Books live UI | **Not performed** |
| Unit tests | Not run for this audit; existing `invoice-line-profit-metrics.test.ts` covers margin logic only |
| Migration `20261020140000` | Present in repo; **deployment status unknown** — treat sales uncosted behavior as **environment-dependent** |

---

## 10. Client Testing Checklist (highest risk)

1. **Finance Summary (no store):** Record purchases and sales in same month — compare “net profit” to **P&L**; expect mismatch until RPT-P0-001 fixed.
2. **Finance Summary (with store):** Same data — compare to P&L with store filter; should align closely.
3. **Uncosted sale:** Zero-cost product, negative stock allowed — sell then purchase; check **Sales by Item** recognized profit vs pending cost (after migration).
4. **Credit note:** Issue CN — compare Sales by Customer vs Salesman totals.
5. **Date boundary:** Invoice on last day of month — compare sales report vs P&L with same calendar filter.
6. **Balance Sheet search:** Search one account — confirm whether section totals should drop (currently they do).
7. **Export:** Filter sales report → export PDF/CSV — totals should match on-screen footer.
8. **VAT return** vs invoice tax totals for same period/store.

---

## 11. Final Readiness Verdict

**Not Ready** for unsupervised finance sign-off.

**Ready with known limitations** for **operations** (stock, aging, payments, VAT detail, activity) **if** users are told not to use **global Finance Summary net profit** or **P&L** as gross margin substitutes.

**Evidence:** P0 mislabeling of purchases as COGS; structural gap between posted P&L and sales margin reports; several P1 reconciliation and labeling issues above.

---

## Appendix A — Files and definitions examined

| Area | Paths |
|------|--------|
| Report registry | `src/common/erp/report-types.ts` |
| Report execution | `src/modules/erp/services/erp-reports.service.ts`, `src/app/api/admin/erp/reports/route.ts` |
| UI shells | `src/modules/admin/views/reports/**/*.tsx`, `business-report-layout.tsx`, `sales-tabular-report.tsx` |
| Finance dashboard | `src/modules/erp/services/erp-finance-dashboard.service.ts`, `src/modules/admin/views/admin-dashboard-view.tsx` |
| Sales profit SQL | `supabase/migrations/20261019240000_fix_sales_report_profit_cost.sql`, `20261020140000_uncosted_sales_profit_reporting.sql` |
| P&L / dashboard RPC | `20260903230000_fix_profit_and_loss_date_filter.sql`, `20260902170000_fix_financial_dashboard_reorder_point.sql` |
| GL posting | `20260823220000_phase5_accounts_vat_banking.sql`, `20260830120000_accounting_ledger_integrity.sql` |
| Inventory costing | `20261001140000_landed_cost_wac_costing.sql` |
| Exports | `src/lib/export/tabular-export.ts`, `src/lib/export/tabular-pdf.ts` |

---

*End of audit document.*
