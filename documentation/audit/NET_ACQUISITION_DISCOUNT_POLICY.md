# Net acquisition cost & header discount policy

## Policy (client)

1. **Purchase bills** — Header discount is prorated to lines by ex-tax extension (`qty × purchase_price`). **Net acquisition** per unit = `(qty×price + landed_allocated − discount_allocated) / qty`. This extension feeds `compute_purchase_bill_inventory_amount`, purchase STOCK/AP balancing (via existing compute+tax preference), SPI/WAC on receipt, and movement replay resolve.
2. **Sales invoices** — Header discount is prorated to lines by taxable extension. **Net revenue ex-tax** = `taxable_amount − discount_allocated` for margin reports; GL revenue remains `total_amount − gst_amount` (header discount already in `total_amount`).
3. **Historical GL** — Posted purchase/sale journals are **not** auto-rewritten. COGS gaps are surfaced via `erp_audit_invoice_cogs_trueup(invoice_id)` for approved adjusting entries only.

## Migrations (apply in order on remote)

| Migration | Purpose |
|-----------|---------|
| `20261026210000_landed_cost_wac_inventory_alignment.sql` | Loaded unit on bill stock; journal balance prefers compute inventory |
| `20261026220000_spi_wac_repair_rpc.sql` | Safe SPI replay/repair RPC + audit table |
| `20261026230000_spi_wac_repair_auth.sql` | Staff/service auth on repair RPC |
| `20261026250000_net_acquisition_discount_policy.sql` | Line columns, allocate RPCs, compute/resolve/inventory_apply, margin `net_revenue_ex_tax`, invoice journal allocates discount before COGS, metadata backfill |
| `20261026250100_refresh_landed_then_net_discount.sql` | Landed refresh always refreshes net unit |
| `20261026250200_sales_reports_line_discount.sql` | Sales-by-customer/item/salesman reports pass `discount_allocated` |

`supabase db push` may fail if remote migration history diverges; apply the SQL files above via Dashboard SQL or repair migration history first.

## Store A (PB-38CE7 / INV-9A400) — verified live (2026-10-26)

| Metric | Before net SPI repair | After net SPI repair (`store-a-net-acquisition-apply-2026-10-26-v1`) |
|--------|----------------------|---------------------------------------------------------------------|
| Bill line net units | 117.5 / 235 (migration metadata) | unchanged |
| `compute_purchase_bill_inventory_amount` | ₹2,350 | ₹2,350 |
| SPI WAC (Mug / Shirt qty 6 / 3) | 120 / 240 → WAC value **₹1,440** | **117.5 / 235** → WAC value **₹1,410** |
| STOCK GL (`get_erp_stock_gl_wac_recon`) | ₹1,550, variance **₹110** | ₹1,550, variance **₹140** |
| Posted COGS / STOCK credit (JE-97D35) | ₹800 | ₹800 (unchanged) |
| Policy COGS at net acquisition (4×117.5 + 2×235) | — | **₹940** → **₹140** true-up needed |

**Remaining gap:** GL STOCK ₹1,550 − on-hand WAC ₹1,410 = **₹140** = policy COGS ₹940 − posted COGS ₹800. No further SPI repair needed (`already_at_target_wac`).

Apply SQL editor migrations through `20261026250800`. Audit: `SELECT erp_audit_invoice_cogs_trueup('<invoice_id>');`

## Operations

- **SPI repair (dry-run / apply):** `erp_spi_wac_repair` — use a **new** idempotency key when re-running after net-acquisition migration.
- **COGS audit:** `SELECT erp_audit_invoice_cogs_trueup('<invoice_id>');`
- **Approved true-up post (idempotent):** migration `20261026250600` (`erp_invoice_net_acquisition_cogs_trueup_post`)
- **Integration:** `ACCOUNTING_INTEGRATION=1` + `ACCOUNTING_STORE_ID` → `npm run erp:accounting:validate`
