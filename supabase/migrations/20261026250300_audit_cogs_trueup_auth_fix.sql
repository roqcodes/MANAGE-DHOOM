-- Live DB missing erp_require_staff_or_service_role on some deployments; restore helper + harden audit RPC.

BEGIN;

CREATE OR REPLACE FUNCTION public.erp_require_staff_or_service_role()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role' THEN
    RETURN;
  END IF;
  IF COALESCE(auth.jwt() ->> 'role', '') = 'service_role' THEN
    RETURN;
  END IF;
  IF COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role' THEN
    RETURN;
  END IF;
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.erp_require_staff_or_service_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_require_staff_or_service_role() TO service_role;

CREATE OR REPLACE FUNCTION public.erp_audit_invoice_cogs_trueup(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_posted numeric := 0;
  v_expected_spi numeric := 0;
  v_expected_policy numeric := 0;
  v_store_id uuid;
  v_number text;
  r record;
  v_unit numeric;
  v_bill_id uuid;
BEGIN
  PERFORM public.erp_require_staff_or_service_role();

  SELECT i.store_id, i.invoice_number
  INTO v_store_id, v_number
  FROM public.invoices i
  WHERE i.id = p_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  v_expected_spi := public.erp_invoice_recognized_cogs_total(p_invoice_id);

  FOR r IN
    SELECT sm.product_id, ABS(sm.quantity) AS issue_qty
    FROM public.stock_movements sm
    WHERE sm.reference_type = 'invoice'
      AND sm.reference_id = p_invoice_id
      AND sm.quantity < 0
  LOOP
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

    v_expected_policy := v_expected_policy + ROUND(
      r.issue_qty * COALESCE(v_unit, 0),
      2
    );
  END LOOP;

  SELECT COALESCE(SUM(jel.credit_amount - jel.debit_amount), 0)
  INTO v_posted
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  JOIN public.accounts a ON a.id = jel.account_id
  WHERE je.source_entity_type = 'invoice'
    AND je.source_entity_id = p_invoice_id
    AND je.status = 'posted'
    AND a.code = 'STOCK';

  RETURN jsonb_build_object(
    'invoice_id', p_invoice_id,
    'invoice_number', v_number,
    'store_id', v_store_id,
    'posted_stock_credit', ROUND(COALESCE(v_posted, 0), 2),
    'expected_cogs_at_current_spi_wac', ROUND(COALESCE(v_expected_spi, 0), 2),
    'expected_cogs_at_net_acquisition_policy', ROUND(COALESCE(v_expected_policy, 0), 2),
    'proposed_stock_credit_adjustment',
      ROUND(COALESCE(v_expected_policy, 0) - COALESCE(v_posted, 0), 2),
    'note',
      'Proposal only — post a manual or approved adjusting journal; this RPC does not mutate GL.'
  );
END;
$$;

COMMIT;
