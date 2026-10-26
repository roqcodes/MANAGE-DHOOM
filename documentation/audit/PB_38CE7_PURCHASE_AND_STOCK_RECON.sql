-- PB-38CE7 purchase journal + Store A stock/WAC reconciliation (read-only).
-- Bill id (Store A): 38ce7467-c8fa-4997-b35a-4df603c3a795
-- Store A: eed2fe05-36a9-492f-9bde-34d5023e2226

-- ─── 1) Bill header and line economics (discount + net acquisition) ───────────
SELECT
  pb.purchase_bill_number,
  pb.purchase_date,
  pb.discount AS header_discount,
  pb.tax_amount,
  pb.total_amount,
  pb.status,
  pbl.product_id,
  p.name AS product_name,
  pbl.quantity,
  pbl.purchase_price,
  pbl.line_total,
  pbl.landed_cost_allocated,
  pbl.discount_allocated,
  pbl.unit_net_acquisition_cost,
  ROUND(
    pbl.line_total + COALESCE(pbl.landed_cost_allocated, 0),
    2
  ) AS gross_purchase_report_value,
  ROUND(
    pbl.line_total + COALESCE(pbl.landed_cost_allocated, 0) - COALESCE(pbl.discount_allocated, 0),
    2
  ) AS net_acquisition_line_value
FROM public.erp_purchase_bills pb
JOIN public.erp_purchase_bill_lines pbl ON pbl.purchase_bill_id = pb.id
LEFT JOIN public.products p ON p.id = COALESCE(pbl.product_id, (
  SELECT pv.product_id FROM public.product_variants pv WHERE pv.id = pbl.variant_id
))
WHERE pb.id = '38ce7467-c8fa-4997-b35a-4df603c3a795'::uuid;

SELECT public.compute_purchase_bill_inventory_amount('38ce7467-c8fa-4997-b35a-4df603c3a795'::uuid)
  AS compute_inventory_amount_for_stock_gl;

-- ─── 2) Posted purchase bill journal (STOCK + input VAT + AP) ─────────────────
SELECT
  je.journal_number,
  je.transaction_date,
  je.total_debit,
  je.total_credit,
  a.code AS account_code,
  jel.debit_amount,
  jel.credit_amount,
  jel.description
FROM public.journal_entries je
JOIN public.journal_entry_lines jel ON jel.journal_entry_id = je.id
JOIN public.accounts a ON a.id = jel.account_id
WHERE je.source_entity_type = 'purchase_bill'
  AND je.source_entity_id = '38ce7467-c8fa-4997-b35a-4df603c3a795'::uuid
  AND je.status = 'posted'
ORDER BY a.code, jel.line_order;

-- Journal must balance: Dr STOCK + Dr VAT = Cr AP = bill total_amount
WITH bill AS (
  SELECT total_amount, tax_amount
  FROM public.erp_purchase_bills
  WHERE id = '38ce7467-c8fa-4997-b35a-4df603c3a795'::uuid
),
jel AS (
  SELECT
    a.code,
    SUM(jel.debit_amount) AS debit,
    SUM(jel.credit_amount) AS credit
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  JOIN public.accounts a ON a.id = jel.account_id
  WHERE je.source_entity_type = 'purchase_bill'
    AND je.source_entity_id = '38ce7467-c8fa-4997-b35a-4df603c3a795'::uuid
    AND je.status = 'posted'
  GROUP BY a.code
)
SELECT
  b.total_amount AS bill_total_amount,
  b.tax_amount AS bill_tax_amount,
  (SELECT debit FROM jel WHERE code = 'STOCK') AS je_stock_debit,
  (SELECT debit FROM jel WHERE code = 'OVERSEAS_TAX_PAYABLE') AS je_input_vat_debit,
  (SELECT credit FROM jel WHERE code = 'ACCOUNTS_PAYABLE') AS je_ap_credit,
  ROUND(
    COALESCE((SELECT debit FROM jel WHERE code = 'STOCK'), 0)
    + COALESCE((SELECT debit FROM jel WHERE code = 'OVERSEAS_TAX_PAYABLE'), 0),
    2
  ) AS je_debits_sum,
  ROUND(
    COALESCE((SELECT credit FROM jel WHERE code = 'ACCOUNTS_PAYABLE'), 0) - b.total_amount,
    2
  ) AS ap_vs_bill_total_delta,
  ROUND(
    COALESCE((SELECT debit FROM jel WHERE code = 'STOCK'), 0)
    + COALESCE((SELECT debit FROM jel WHERE code = 'OVERSEAS_TAX_PAYABLE'), 0)
    - COALESCE((SELECT credit FROM jel WHERE code = 'ACCOUNTS_PAYABLE'), 0),
    2
  ) AS journal_balance_check;

-- Expected PB-38CE7 (after net-acquisition migration):
--   • Purchase-by-item gross: SUM(line_total + landed) — often ₹2,300–2,400 depending on line_total vs qty×price.
--   • compute_purchase_bill_inventory_amount: ₹2,350 (= net acquisition after ₹50 discount).
--   • If ROUND(compute + tax_amount, 2) = total_amount → STOCK debit = compute; else STOCK = total − tax.
--   • AP credit always = total_amount (e.g. ₹2,650); STOCK debit + input VAT debit = AP credit.

-- ─── 3) Purchase by Item report gross total (excludes ₹50 discount) ───────────
SELECT ROUND(SUM(pbl.line_total + COALESCE(pbl.landed_cost_allocated, 0)), 2) AS purchase_by_item_gross
FROM public.erp_purchase_bill_lines pbl
JOIN public.erp_purchase_bills pb ON pb.id = pbl.purchase_bill_id
WHERE pb.id = '38ce7467-c8fa-4997-b35a-4df603c3a795'::uuid;

-- ─── 4) Store A SPI/WAC vs quantities (internal consistency) ──────────────────
SELECT
  p.name,
  spi.stock AS qty,
  spi.purchase_price AS wac_unit,
  ROUND(spi.stock * spi.purchase_price, 2) AS wac_line_value
FROM public.store_product_inventory spi
JOIN public.products p ON p.id = spi.product_id
WHERE spi.store_id = 'eed2fe05-36a9-492f-9bde-34d5023e2226'::uuid
  AND COALESCE(spi.stock, 0) <> 0
ORDER BY p.name;

SELECT ROUND(
  COALESCE(SUM(spi.stock * spi.purchase_price), 0),
  2
) AS store_a_wac_extension
FROM public.store_product_inventory spi
WHERE spi.store_id = 'eed2fe05-36a9-492f-9bde-34d5023e2226'::uuid;

-- After test sales (INV-9A400 / C9C7E / CN-65030), expect e.g. 6×117.5 + 3×235 = ₹1,410 if those are on-hand qty/WAC.

SELECT public.get_erp_stock_gl_wac_recon_report('eed2fe05-36a9-492f-9bde-34d5023e2226'::uuid);

-- in_sync = true only when STOCK GL balance equals SUM(qty×WAC). Sales COGS credits reduce GL
-- without changing WAC units; variance after sales is a separate GL-vs-WAC topic, not unit math.
