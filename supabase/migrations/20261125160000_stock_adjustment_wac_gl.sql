-- Stock adjustment finalize: blend WAC on add; remove at store WAC; post STOCK GL.

BEGIN;

UPDATE public.erp_posting_rules
SET
  is_enabled = true,
  mapping_notes = 'Add: DR STOCK (line value), CR OTHER_INCOME. Remove: DR OTHER_EXPENSE, CR STOCK at current store WAC.'
WHERE event_type = 'stock_adjustment';

CREATE OR REPLACE FUNCTION public.post_journal_for_stock_adjustment(
  p_adjustment_id uuid,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
  v_date date;
  v_number text;
  v_add_total numeric;
  v_remove_total numeric;
  v_lines jsonb := '[]'::jsonb;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF NOT public.is_posting_enabled('stock_adjustment') THEN
    RETURN NULL;
  END IF;

  SELECT a.store_id, a.adjustment_date, a.adjustment_number, a.total_add_cost, a.total_remove_cost
  INTO v_store_id, v_date, v_number, v_add_total, v_remove_total
  FROM public.erp_stock_adjustments a
  WHERE a.id = p_adjustment_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  v_add_total := COALESCE(v_add_total, 0);
  v_remove_total := COALESCE(v_remove_total, 0);

  IF v_add_total <= 0 AND v_remove_total <= 0 THEN
    RETURN NULL;
  END IF;

  PERFORM public.ensure_system_ledger_account('STOCK', 'Stock');
  PERFORM public.ensure_system_ledger_account('OTHER_INCOME', 'Other Income');
  PERFORM public.ensure_system_ledger_account('OTHER_EXPENSE', 'Other Expense');

  IF v_add_total > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'account_code', 'STOCK',
        'debit', ROUND(v_add_total, 2),
        'description', 'Stock adjustment add ' || v_number
      ),
      jsonb_build_object(
        'account_code', 'OTHER_INCOME',
        'credit', ROUND(v_add_total, 2),
        'description', 'Stock found / count add ' || v_number
      )
    );
  END IF;

  IF v_remove_total > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'account_code', 'OTHER_EXPENSE',
        'debit', ROUND(v_remove_total, 2),
        'description', 'Stock remove ' || v_number
      ),
      jsonb_build_object(
        'account_code', 'STOCK',
        'credit', ROUND(v_remove_total, 2),
        'description', 'Stock remove ' || v_number
      )
    );
  END IF;

  RETURN public.create_posted_journal_entry(
    v_date,
    'Stock adjustment ' || v_number,
    v_store_id,
    'stock_adjustment',
    p_adjustment_id,
    v_lines,
    p_actor
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_erp_stock_adjustment(
  p_adjustment_id uuid,
  p_finalized_by uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
  v_committed boolean;
  v_status text;
  r record;
  v_delta numeric;
  v_product_id uuid;
  v_wac numeric;
  v_line_value numeric;
  v_add_cost numeric := 0;
  v_remove_cost numeric := 0;
BEGIN
  IF NOT public.is_staff_user(p_finalized_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT store_id, inventory_committed, status
  INTO v_store_id, v_committed, v_status
  FROM public.erp_stock_adjustments
  WHERE id = p_adjustment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Adjustment not found';
  END IF;

  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot finalize cancelled adjustment';
  END IF;

  IF v_committed THEN
    RETURN;
  END IF;

  PERFORM public.require_store_access(v_store_id, p_finalized_by);

  FOR r IN
    SELECT l.variant_id, l.product_id, l.direction, l.quantity, l.purchase_cost, l.line_total
    FROM public.erp_stock_adjustment_lines l
    WHERE l.adjustment_id = p_adjustment_id
  LOOP
    v_product_id := COALESCE(
      r.product_id,
      (SELECT product_id FROM public.product_variants WHERE id = r.variant_id)
    );

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'Product is required for adjustment line';
    END IF;

    IF r.direction = 'add' THEN
      v_delta := r.quantity;
      v_add_cost := v_add_cost + COALESCE(r.line_total, ROUND(r.quantity * r.purchase_cost, 2));

      PERFORM public.store_product_inventory_apply_receipt_cost(
        v_store_id, v_product_id, v_delta, r.purchase_cost, p_finalized_by
      );

      PERFORM public.log_product_stock_movement(
        v_product_id, v_delta, 'adjustment',
        p_adjustment_id, 'stock_adjustment',
        'Stock adjustment finalized', v_store_id, NULL, r.purchase_cost, p_finalized_by
      );
      CONTINUE;
    END IF;

    v_delta := -r.quantity;

    SELECT spi.purchase_price
    INTO v_wac
    FROM public.store_product_inventory spi
    WHERE spi.store_id = v_store_id AND spi.product_id = v_product_id
    FOR UPDATE;

    IF COALESCE(v_wac, 0) <= 0 THEN
      v_wac := public.erp_resolve_invoice_line_cost(0, NULL, v_product_id, v_store_id);
    END IF;

    IF COALESCE(v_wac, 0) <= 0 THEN
      RAISE EXCEPTION 'Cannot remove stock without a store unit cost for product %', v_product_id;
    END IF;

    v_line_value := ROUND(r.quantity * v_wac, 2);
    v_remove_cost := v_remove_cost + v_line_value;

    PERFORM public.store_product_inventory_apply_delta(
      v_store_id, v_product_id, v_delta, p_finalized_by
    );

    PERFORM public.log_product_stock_movement(
      v_product_id, v_delta, 'damaged',
      p_adjustment_id, 'stock_adjustment',
      'Stock adjustment finalized', v_store_id, NULL, v_wac, p_finalized_by
    );
  END LOOP;

  UPDATE public.erp_stock_adjustments
  SET
    total_add_cost = v_add_cost,
    total_remove_cost = v_remove_cost,
    status = 'finalized',
    inventory_committed = true,
    updated_at = now()
  WHERE id = p_adjustment_id;

  PERFORM public.post_journal_for_stock_adjustment(p_adjustment_id, p_finalized_by);
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_journal_for_stock_adjustment(uuid, uuid) TO authenticated;

COMMIT;