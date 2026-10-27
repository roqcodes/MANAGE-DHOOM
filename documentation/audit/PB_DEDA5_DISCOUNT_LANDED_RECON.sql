-- PB-DEDA5 pattern: discount + landed on same basis; net acquisition vs GL vs SPI (read-only).
-- Replace :bill_id or filter by purchase_bill_number = 'PB-DEDA5'.

-- ─── 1) Line economics ───────────────────────────────────────────────────────
SELECT
  pb.purchase_bill_number,
  pb.discount AS header_discount,
  pb.total_amount,
  pb.tax_amount,
  pb.status,
  pb.store_id,
  p.name AS product_name,
  pbl.quantity,
  pbl.purchase_price,
  pbl.landed_cost_allocated,
  pbl.discount_allocated,
  pbl.unit_loaded_cost,
  pbl.unit_net_acquisition_cost,
  ROUND(
    pbl.quantity * pbl.purchase_price
    + COALESCE(pbl.landed_cost_allocated, 0)
    - COALESCE(pbl.discount_allocated, 0),
    2
  ) AS net_line_value,
  public.compute_purchase_bill_inventory_amount(pb.id) AS bill_inventory_compute
FROM public.erp_purchase_bills pb
JOIN public.erp_purchase_bill_lines pbl ON pbl.purchase_bill_id = pb.id
LEFT JOIN public.products p ON p.id = COALESCE(pbl.product_id, (
  SELECT pv.product_id FROM public.product_variants pv WHERE pv.id = pbl.variant_id
))
WHERE pb.purchase_bill_number = 'PB-DEDA5'
   OR pb.id = '00000000-0000-0000-0000-000000000000'::uuid; -- set bill id for disposable test

-- Expect per line (equal extensions): landed 30, discount 20, net units 52.5 / 42 / 21.

-- ─── 2) SPI vs net unit on bill line ─────────────────────────────────────────
SELECT
  p.name,
  spi.stock,
  spi.purchase_price AS spi_wac,
  pbl.unit_net_acquisition_cost AS bill_net_unit,
  pbl.unit_loaded_cost AS bill_loaded_unit,
  ROUND(spi.purchase_price - pbl.unit_net_acquisition_cost, 4) AS wac_minus_net_unit
FROM public.erp_purchase_bills pb
JOIN public.erp_purchase_bill_lines pbl ON pbl.purchase_bill_id = pb.id
JOIN public.products p ON p.id = COALESCE(pbl.product_id, (
  SELECT pv.product_id FROM public.product_variants pv WHERE pv.id = pbl.variant_id
))
JOIN public.store_product_inventory spi
  ON spi.store_id = pb.store_id AND spi.product_id = p.id
WHERE pb.purchase_bill_number = 'PB-DEDA5';

-- wac_minus_net_unit should be 0 when this bill fully sets WAC.

-- ─── 3) Posted journal vs bill total ───────────────────────────────────────────
SELECT
  je.journal_number,
  a.code,
  jel.debit_amount,
  jel.credit_amount
FROM public.journal_entries je
JOIN public.journal_entry_lines jel ON jel.journal_entry_id = je.id
JOIN public.accounts a ON a.id = jel.account_id
JOIN public.erp_purchase_bills pb ON pb.id = je.source_entity_id
WHERE je.source_entity_type = 'purchase_bill'
  AND pb.purchase_bill_number = 'PB-DEDA5'
  AND je.status = 'posted'
ORDER BY a.code;
