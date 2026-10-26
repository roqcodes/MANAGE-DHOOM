-- COGS true-up audit: separate frozen posting basis, current SPI WAC, and net acquisition policy.

BEGIN;

CREATE OR REPLACE FUNCTION public.erp_audit_invoice_cogs_trueup(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_posted_stock numeric := 0;
  v_posted_cogs numeric := 0;
  v_frozen numeric := 0;
  v_spi_wac numeric := 0;
  v_policy numeric := 0;
  v_store_id uuid;
  v_number text;
  r record;
  v_unit numeric;
  v_bill_id uuid;
  v_spi_unit numeric;
  v_net_issue_qty numeric;
BEGIN
  PERFORM public.erp_require_staff_or_service_role();

  SELECT i.store_id, i.invoice_number
  INTO v_store_id, v_number
  FROM public.invoices i
  WHERE i.id = p_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  -- Frozen at posting: invoice line base_price / margin snapshot (not current SPI).
  v_frozen := public.erp_invoice_recognized_cogs_total(p_invoice_id);

  -- Current SPI WAC × net quantities issued on this invoice (per store).
  FOR r IN
    SELECT
      sm.product_id,
      SUM(CASE WHEN sm.quantity < 0 THEN ABS(sm.quantity) ELSE 0 END)
        - SUM(CASE WHEN sm.quantity > 0 THEN sm.quantity ELSE 0 END) AS net_issue_qty
    FROM public.stock_movements sm
    WHERE sm.store_id = v_store_id
      AND sm.reference_type = 'invoice'
      AND sm.reference_id = p_invoice_id
    GROUP BY sm.product_id
    HAVING SUM(CASE WHEN sm.quantity < 0 THEN ABS(sm.quantity) ELSE 0 END)
         - SUM(CASE WHEN sm.quantity > 0 THEN sm.quantity ELSE 0 END) > 0
  LOOP
    SELECT spi.purchase_price
    INTO v_spi_unit
    FROM public.store_product_inventory spi
    WHERE spi.store_id = v_store_id
      AND spi.product_id = r.product_id;

    v_spi_wac := v_spi_wac + ROUND(
      r.net_issue_qty * COALESCE(v_spi_unit, 0),
      2
    );
  END LOOP;

  -- Approved policy: net acquisition unit from source purchase bill (landed − prorated discount).
  FOR r IN
    SELECT
      sm.product_id,
      SUM(CASE WHEN sm.quantity < 0 THEN ABS(sm.quantity) ELSE 0 END)
        - SUM(CASE WHEN sm.quantity > 0 THEN sm.quantity ELSE 0 END) AS net_issue_qty
    FROM public.stock_movements sm
    WHERE sm.store_id = v_store_id
      AND sm.reference_type = 'invoice'
      AND sm.reference_id = p_invoice_id
    GROUP BY sm.product_id
    HAVING SUM(CASE WHEN sm.quantity < 0 THEN ABS(sm.quantity) ELSE 0 END)
         - SUM(CASE WHEN sm.quantity > 0 THEN sm.quantity ELSE 0 END) > 0
  LOOP
    v_net_issue_qty := r.net_issue_qty;

    SELECT sm2.reference_id
    INTO v_bill_id
    FROM public.stock_movements sm2
    WHERE sm2.store_id = v_store_id
      AND sm2.product_id = r.product_id
      AND sm2.reference_type = 'purchase_bill'
      AND sm2.quantity > 0
    ORDER BY sm2.created_at DESC
    LIMIT 1;

    v_unit := public.erp_resolve_stock_movement_unit_cost(
      r.product_id,
      'purchase_bill',
      v_bill_id,
      NULL
    );

    v_policy := v_policy + ROUND(v_net_issue_qty * COALESCE(v_unit, 0), 2);
  END LOOP;

  SELECT COALESCE(SUM(jel.credit_amount - jel.debit_amount), 0)
  INTO v_posted_stock
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  JOIN public.accounts a ON a.id = jel.account_id
  WHERE je.source_entity_type = 'invoice'
    AND je.source_entity_id = p_invoice_id
    AND je.status = 'posted'
    AND a.code = 'STOCK';

  SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0)
  INTO v_posted_cogs
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  JOIN public.accounts a ON a.id = jel.account_id
  WHERE je.source_entity_type = 'invoice'
    AND je.source_entity_id = p_invoice_id
    AND je.status = 'posted'
    AND a.code = 'COST_OF_GOODS_SOLD';

  RETURN jsonb_build_object(
    'invoice_id', p_invoice_id,
    'invoice_number', v_number,
    'store_id', v_store_id,
    'posted_cogs_gl', ROUND(COALESCE(v_posted_cogs, 0), 2),
    'posted_stock_credit', ROUND(COALESCE(v_posted_stock, 0), 2),
    'expected_cogs_at_frozen_posting_basis', ROUND(COALESCE(v_frozen, 0), 2),
    'expected_cogs_at_current_spi_wac', ROUND(COALESCE(v_spi_wac, 0), 2),
    'expected_cogs_at_net_acquisition_policy', ROUND(COALESCE(v_policy, 0), 2),
    'proposed_cogs_adjustment',
      ROUND(COALESCE(v_policy, 0) - COALESCE(v_posted_cogs, 0), 2),
    'proposed_stock_credit_adjustment',
      ROUND(COALESCE(v_policy, 0) - COALESCE(v_posted_stock, 0), 2),
    'field_notes', jsonb_build_object(
      'frozen_posting_basis',
        'erp_invoice_recognized_cogs_total — line base_price / posting-time margin snapshot',
      'current_spi_wac',
        'net invoice stock issues × store_product_inventory.purchase_price today',
      'net_acquisition_policy',
        'net invoice issues × unit_net_acquisition_cost from source purchase bill (resolve RPC)',
      'adjustment_basis',
        'net_acquisition_policy minus posted_cogs_gl; equals additional Dr COGS / Cr STOCK'
    ),
    'note',
      'Proposal only — post a manual or approved adjusting journal; this RPC does not mutate GL.'
  );
END;
$$;

COMMIT;
