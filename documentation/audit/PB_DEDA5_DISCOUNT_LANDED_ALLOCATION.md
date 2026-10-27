# PB-DEDA5 — Purchase discount vs landed cost allocation audit

**Bill:** `PB-DEDA5` (Store A)  
**Policy:** Header purchase discount and landed costs prorate on **qty × unit purchase price** (ex-tax extension). Net line value = extension + landed share − discount share. WAC / STOCK / movements use **`unit_net_acquisition_cost`** after migration `20261026250000_net_acquisition_discount_policy.sql`.

## Example economics

| Line | Qty × rate | Extension | Landed (₹90 ÷ 3) | Discount (₹60 ÷ 3) | Net line | Net unit |
|------|------------|-----------|------------------|----------------------|----------|----------|
| Product B | 4 × ₹50 | ₹200 | ₹30 | ₹20 | ₹210 | **₹52.50** |
| Product A | 5 × ₹40 | ₹200 | ₹30 | ₹20 | ₹210 | **₹42.00** |
| QA-NEG-LANDED-001 | 10 × ₹20 | ₹200 | ₹30 | ₹20 | ₹210 | **₹21.00** |

Bill inventory subtotal (ex-tax): **₹630** (= ₹600 lines + ₹90 landed − ₹60 discount).

## Posting flow (read-only trace)

1. **Landed** — `erp_prorate_purchase_bill_landed` / `refresh_purchase_bill_landed_allocations` sets `landed_cost_allocated` and `unit_loaded_cost = purchase_price + landed/qty` (no discount).
2. **Discount** — `erp_allocate_purchase_bill_discount` prorates header `discount` into `discount_allocated`, then `erp_refresh_purchase_bill_line_net_unit` sets `unit_net_acquisition_cost`.
3. **Stock / WAC** — `inventory_apply_purchase_bill_stock` (26250000+) receipts at `COALESCE(unit_net_acquisition_cost, unit_loaded_cost, purchase_price)`.
4. **GL inventory** — `compute_purchase_bill_inventory_amount` sums line net acquisition (extension + landed − discount).

## Root cause of ₹21 WAC vs ₹23 purchase history

| Surface | Field / logic | QA-NEG-LANDED-001 unit |
|---------|----------------|-------------------------|
| Inventory modal WAC | `store_product_inventory.purchase_price` from net receipt | **₹21** (correct) |
| Purchase history (before fix) | `unit_loaded_cost` / loaded helper only | **₹23** (= ₹20 + ₹30/10, discount omitted) |

**Verdict:** Inventory valuation, stock movements, and GL compute were **aligned** on net acquisition. The mismatch was a **display bug** in store inventory purchase history / glance (used pre-discount loaded unit).

**Smallest safe fix:** Load `discount_allocated` and `unit_net_acquisition_cost` in purchase analytics; show **net unit** in history and summaries (keep loaded unit in API for bill print/detail).

## Reconciliation queries

Use `documentation/audit/PB_DEDA5_DISCOUNT_LANDED_RECON.sql` against a disposable bill matching PB-DEDA5 pattern (replace bill id / number).

Checks:

- `SUM(qty×price + landed − discount)` = `compute_purchase_bill_inventory_amount`
- SPI WAC × qty ≈ net line value for full receipt
- Posted STOCK debit matches `purchase_journal_balance_stock_to_ap(compute, tax, total)`
- Store B bills do not affect Store A SPI

## Regression tests

`npm run test:erp:purchase-net` — asserts net units **52.5**, **42**, **21** and bill net **630** for the PB-DEDA5 fixture.

## Historical data

No journal rewrite or cost true-up required for bills already posted under 26250000+ functions when SPI was updated at finalize. Bills finalized **only** under 26210000 (loaded WAC, no discount in receipt) may need staff `erp_reapply_bill_loaded_wac` — out of scope for PB-DEDA5 if WAC already shows ₹21.
