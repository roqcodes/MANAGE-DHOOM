-- INV-9C026 / QA-NEG-STOCK-001 negative-stock costing audit (read-only).
-- Apply 20261026252300 before expecting Sales-by-Item COGS to pin at sale-time cost.

-- 1) Invoice line cost flags vs live SPI
SELECT
  i.invoice_number,
  i.status,
  i.store_id,
  ii.product_name,
  ii.quantity,
  ii.unit_price,
  ii.base_price AS sale_time_cost,
  ii.pending_cost_qty,
  COALESCE(ii.discount_allocated, 0) AS discount_allocated,
  COALESCE(ii.taxable_amount, ii.total_amount - ii.gst_amount) AS taxable_amount,
  spi.stock AS on_hand,
  spi.purchase_price AS live_wac
FROM public.invoices i
JOIN public.invoice_items ii ON ii.invoice_id = i.id
LEFT JOIN public.store_product_inventory spi
  ON spi.store_id = i.store_id
 AND spi.product_id = ii.product_id
WHERE i.invoice_number = 'INV-9C026';

-- 2) Margin components (after 26252300 should use base_price, not live WAC)
SELECT
  mc.line_cogs,
  mc.uncosted_revenue,
  mc.recognized_profit,
  mc.net_revenue_ex_tax
FROM public.invoices i
JOIN public.invoice_items ii ON ii.invoice_id = i.id
CROSS JOIN LATERAL public.erp_invoice_item_margin_components(
  ii.base_price,
  ii.unit_price,
  ii.variant_id,
  ii.product_id,
  i.store_id,
  ii.quantity,
  ii.pending_cost_qty,
  COALESCE(ii.taxable_amount, ii.total_amount - ii.gst_amount),
  COALESCE(ii.discount_allocated, 0)
) mc
WHERE i.invoice_number = 'INV-9C026';

-- 3) Recognized (margin RPC) vs posted COGS from journal lines.
-- Inlined: remote DB may not have erp_invoice_posted_cogs_gl_total.
WITH inv AS (
  SELECT id, invoice_number
  FROM public.invoices
  WHERE invoice_number = 'INV-9C026'
),
recognized AS (
  SELECT ROUND(COALESCE(SUM(mc.line_cogs), 0), 2) AS recognized_cogs
  FROM inv
  JOIN public.invoice_items ii ON ii.invoice_id = inv.id
  JOIN public.invoices i ON i.id = inv.id
  CROSS JOIN LATERAL public.erp_invoice_item_margin_components(
    ii.base_price,
    ii.unit_price,
    ii.variant_id,
    ii.product_id,
    i.store_id,
    ii.quantity,
    ii.pending_cost_qty,
    COALESCE(ii.taxable_amount, ii.total_amount - ii.gst_amount),
    COALESCE(ii.discount_allocated, 0)
  ) mc
),
posted AS (
  SELECT ROUND(
    COALESCE(SUM(COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0)), 0),
    2
  ) AS posted_cogs_gl
  FROM inv
  JOIN public.journal_entries je
    ON je.status = 'posted'
   AND (
        (je.source_entity_type IN ('invoice', 'invoice_cogs_backfill')
         AND je.source_entity_id = inv.id)
     OR (je.source_entity_type = 'invoice_deferred_cogs'
         AND je.description ILIKE '%' || inv.invoice_number || '%')
   )
  JOIN public.journal_entry_lines jel ON jel.journal_entry_id = je.id
  JOIN public.accounts a ON a.id = jel.account_id AND a.code = 'COST_OF_GOODS_SOLD'
)
SELECT
  (SELECT invoice_number FROM inv) AS invoice_number,
  r.recognized_cogs,
  p.posted_cogs_gl,
  ROUND(r.recognized_cogs - p.posted_cogs_gl, 2) AS recognized_vs_posted_gap
FROM recognized r
CROSS JOIN posted p;

SELECT
  je.journal_number,
  je.source_entity_type,
  je.transaction_date,
  a.code,
  jel.debit_amount,
  jel.credit_amount,
  jel.description
FROM public.invoices i
JOIN public.journal_entries je
  ON je.status = 'posted'
 AND (
      (je.source_entity_type IN ('invoice', 'invoice_cogs_backfill')
       AND je.source_entity_id = i.id)
   OR (je.source_entity_type = 'invoice_deferred_cogs'
       AND je.description ILIKE '%' || i.invoice_number || '%')
 )
JOIN public.journal_entry_lines jel ON jel.journal_entry_id = je.id
JOIN public.accounts a ON a.id = jel.account_id
WHERE i.invoice_number = 'INV-9C026'
ORDER BY je.created_at, a.code;

-- 4) Deferred allocation table (NULL = migration 20160000 not applied)
SELECT to_regclass('public.erp_invoice_deferred_cogs_postings') AS deferred_cogs_table;

-- If the previous cell is not null, run:
-- SELECT d.*
-- FROM public.erp_invoice_deferred_cogs_postings d
-- JOIN public.invoices i ON i.id = d.invoice_id
-- WHERE i.invoice_number = 'INV-9C026';
