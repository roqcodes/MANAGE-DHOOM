-- Purchase bill journal: inventory debit must include landed cost (total - tax).
-- Previously qty × purchase_price omitted landed, so AP 123 vs stock 23 failed.

BEGIN;

CREATE OR REPLACE FUNCTION public.compute_purchase_bill_inventory_amount(p_bill_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount numeric := 0;
BEGIN
  IF p_bill_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(
    SUM(
      public.erp_round_calc(
        GREATEST(0, pbl.quantity)
          * COALESCE(pbl.purchase_price, 0)
        + GREATEST(0, COALESCE(pbl.landed_cost_allocated, 0))
      )
    ),
    0
  )
  INTO v_amount
  FROM public.erp_purchase_bill_lines pbl
  WHERE pbl.purchase_bill_id = p_bill_id
    AND pbl.quantity > 0;

  RETURN GREATEST(0, COALESCE(v_amount, 0));
END;
$$;

-- Always post STOCK so STOCK + tax = AP (landed sits in inventory).
CREATE OR REPLACE FUNCTION public.purchase_journal_balance_stock_to_ap(
  p_stock numeric,
  p_tax numeric,
  p_ap_total numeric
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    CASE
      WHEN COALESCE(p_ap_total, 0) <= 0 THEN GREATEST(0, public.erp_round_calc(COALESCE(p_stock, 0)))
      ELSE GREATEST(
        0,
        public.erp_round_calc(COALESCE(p_ap_total, 0) - COALESCE(p_tax, 0))
      )
    END;
$$;

CREATE OR REPLACE FUNCTION public.post_journal_for_purchase_bill(
  p_bill_id uuid,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing uuid;
  v_total numeric;
  v_tax numeric;
  v_stock numeric;
  v_store_id uuid;
  v_date date;
  v_number text;
  v_lines jsonb := '[]'::jsonb;
  v_use_grni boolean;
BEGIN
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT id INTO v_existing
  FROM public.journal_entries
  WHERE source_entity_type = 'purchase_bill'
    AND source_entity_id = p_bill_id
    AND status = 'posted';
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  IF NOT public.is_posting_enabled('purchase_bill') THEN
    RETURN NULL;
  END IF;

  SELECT total_amount, tax_amount, store_id, purchase_date, purchase_bill_number
  INTO v_total, v_tax, v_store_id, v_date, v_number
  FROM public.erp_purchase_bills
  WHERE id = p_bill_id
    AND status IN ('finalized', 'partial', 'paid');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase bill not found or not eligible for journal posting';
  END IF;

  IF COALESCE(v_total, 0) <= 0 THEN
    RETURN NULL;
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  v_tax := COALESCE(v_tax, 0);
  v_use_grni := public.purchase_bill_uses_grni_clearing(p_bill_id);

  IF v_use_grni THEN
    PERFORM public.ensure_system_ledger_account('GOODS_RECEIPT_PENDING', 'Goods Receipt Pending');
    PERFORM public.ensure_system_ledger_account('ACCOUNTS_PAYABLE', 'Accounts Payable');

    v_lines := jsonb_build_array(
      jsonb_build_object(
        'account_code', 'GOODS_RECEIPT_PENDING', 'debit', v_total,
        'description', 'Purchase bill ' || v_number
      ),
      jsonb_build_object(
        'account_code', 'ACCOUNTS_PAYABLE', 'credit', v_total,
        'description', 'AP'
      )
    );
  ELSE
    v_stock := public.purchase_journal_balance_stock_to_ap(
      public.compute_purchase_bill_inventory_amount(p_bill_id),
      v_tax,
      v_total
    );

    PERFORM public.ensure_system_ledger_account('STOCK', 'Stock');
    PERFORM public.ensure_system_ledger_account('ACCOUNTS_PAYABLE', 'Accounts Payable');
    PERFORM public.ensure_system_ledger_account('OVERSEAS_TAX_PAYABLE', 'Overseas Tax Payable');

    IF v_stock > 0 THEN
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object(
          'account_code', 'STOCK', 'debit', v_stock,
          'description', 'Purchase bill ' || v_number
        )
      );
    END IF;

    IF v_tax > 0 THEN
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object(
          'account_code', 'OVERSEAS_TAX_PAYABLE', 'debit', v_tax,
          'description', 'Input tax'
        )
      );
    END IF;

    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'account_code', 'ACCOUNTS_PAYABLE', 'credit', v_total,
        'description', 'AP'
      )
    );
  END IF;

  RETURN public.create_posted_journal_entry(
    v_date, 'Purchase bill ' || v_number, v_store_id, 'purchase_bill', p_bill_id, v_lines, p_actor
  );
END;
$$;

COMMIT;
