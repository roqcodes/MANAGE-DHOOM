-- Idempotent supplemental COGS journal at net-acquisition policy (does not touch invoice revenue JE).

BEGIN;

CREATE OR REPLACE FUNCTION public.erp_post_invoice_net_acquisition_cogs_trueup(
  p_invoice_id uuid,
  p_actor uuid,
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gap numeric;
  v_posted_cogs numeric := 0;
  v_policy numeric := 0;
  v_store_id uuid;
  v_number text;
  v_date date;
  v_existing uuid;
  v_existing_cogs numeric;
  v_cogs_account uuid;
  v_journal_id uuid;
  v_lines jsonb;
  v_memo text;
  r record;
  v_bill_id uuid;
  v_unit numeric;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden: valid staff p_actor is required';
  END IF;

  SELECT store_id, invoice_number, COALESCE(issued_at::date, created_at::date)
  INTO v_store_id, v_number, v_date
  FROM public.invoices
  WHERE id = p_invoice_id
    AND status IN ('issued', 'partial', 'paid');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('invoice_id', p_invoice_id, 'action', 'skipped', 'reason', 'ineligible_status');
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  IF NOT public.erp_invoice_has_posted_revenue_journal(p_invoice_id) THEN
    RETURN jsonb_build_object(
      'invoice_id', p_invoice_id,
      'action', 'skipped',
      'reason', 'no_posted_revenue_journal'
    );
  END IF;

  -- Gap from policy (net acquisition) minus posted COGS — same rules as erp_audit_invoice_cogs_trueup.
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
      r.product_id, 'purchase_bill', v_bill_id, NULL
    );
    v_policy := v_policy + ROUND(r.net_issue_qty * COALESCE(v_unit, 0), 2);
  END LOOP;

  SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0)
  INTO v_posted_cogs
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  JOIN public.accounts a ON a.id = jel.account_id
  WHERE je.source_entity_type = 'invoice'
    AND je.source_entity_id = p_invoice_id
    AND je.status = 'posted'
    AND a.code = 'COST_OF_GOODS_SOLD';

  v_gap := ROUND(COALESCE(v_policy, 0) - COALESCE(v_posted_cogs, 0), 2);

  IF v_gap IS NULL OR v_gap <= 0.01 THEN
    RETURN jsonb_build_object(
      'invoice_id', p_invoice_id,
      'action', 'already_correct',
      'posted_cogs_gl', v_posted_cogs,
      'expected_cogs_at_net_acquisition_policy', v_policy,
      'gap', v_gap
    );
  END IF;

  SELECT id INTO v_existing
  FROM public.journal_entries
  WHERE source_entity_type = 'invoice_net_acquisition_cogs_trueup'
    AND source_entity_id = p_invoice_id
    AND status = 'posted';

  IF v_existing IS NOT NULL THEN
    v_cogs_account := public.get_account_by_code('COST_OF_GOODS_SOLD');
    SELECT ROUND(COALESCE(SUM(jel.debit_amount), 0), 2)
    INTO v_existing_cogs
    FROM public.journal_entry_lines jel
    WHERE jel.journal_entry_id = v_existing
      AND jel.account_id = v_cogs_account;

    IF ABS(v_existing_cogs - v_gap) > 0.02 THEN
      RETURN jsonb_build_object(
        'invoice_id', p_invoice_id,
        'action', 'manual_review',
        'reason', 'trueup_amount_mismatch',
        'expected_gap', v_gap,
        'existing_trueup_cogs', v_existing_cogs,
        'journal_entry_id', v_existing,
        'gap', v_gap
      );
    END IF;

    RETURN jsonb_build_object(
      'invoice_id', p_invoice_id,
      'action', 'already_posted',
      'journal_entry_id', v_existing,
      'amount', v_existing_cogs,
      'gap', v_gap
    );
  END IF;

  v_memo := 'COGS true-up ' || v_number || ' — net acquisition policy';

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'invoice_id', p_invoice_id,
      'invoice_number', v_number,
      'store_id', v_store_id,
      'transaction_date', v_date,
      'action', 'would_post',
      'amount', v_gap,
      'description', v_memo,
      'source_entity_type', 'invoice_net_acquisition_cogs_trueup',
      'proposed_lines', jsonb_build_array(
        jsonb_build_object('account_code', 'COST_OF_GOODS_SOLD', 'debit', v_gap),
        jsonb_build_object('account_code', 'STOCK', 'credit', v_gap)
      ),
      'posted_cogs_gl', v_posted_cogs,
      'expected_cogs_at_net_acquisition_policy', v_policy
    );
  END IF;

  IF NOT public.is_posting_enabled('invoice') THEN
    RETURN jsonb_build_object('invoice_id', p_invoice_id, 'action', 'skipped', 'reason', 'posting_disabled');
  END IF;

  PERFORM public.ensure_system_ledger_account('COST_OF_GOODS_SOLD', 'Cost of Goods Sold');
  PERFORM public.ensure_system_ledger_account('STOCK', 'Stock');

  v_lines := jsonb_build_array(
    jsonb_build_object(
      'account_code', 'COST_OF_GOODS_SOLD',
      'debit', v_gap,
      'description', v_memo
    ),
    jsonb_build_object(
      'account_code', 'STOCK',
      'credit', v_gap,
      'description', v_memo
    )
  );

  v_journal_id := public.create_posted_journal_entry(
    v_date,
    v_memo,
    v_store_id,
    'invoice_net_acquisition_cogs_trueup',
    p_invoice_id,
    v_lines,
    p_actor
  );

  RETURN jsonb_build_object(
    'invoice_id', p_invoice_id,
    'action', 'posted',
    'journal_entry_id', v_journal_id,
    'amount', v_gap,
    'transaction_date', v_date,
    'posted_cogs_gl', v_posted_cogs,
    'expected_cogs_at_net_acquisition_policy', v_policy
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.erp_post_invoice_net_acquisition_cogs_trueup(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_post_invoice_net_acquisition_cogs_trueup(uuid, uuid, boolean) TO service_role;

COMMIT;
