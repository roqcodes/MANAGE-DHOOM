  -- Line-level purchase GL (loaded inventory + input tax) and per-receive GRNI clearance.
  -- Patterns: Odoo perpetual inventory (stock at loaded cost, VAT separate), partial receipts clear GRNI incrementally.

  BEGIN;

  -- ─── Capitalization helpers ───────────────────────────────────────────────────

  CREATE OR REPLACE FUNCTION public.compute_purchase_bill_inventory_amount(p_bill_id uuid)
  RETURNS numeric
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public
  AS $$
  DECLARE
    v_amount numeric := 0;
  BEGIN
    IF p_bill_id IS NULL THEN
      RETURN 0;
    END IF;

    PERFORM public.refresh_purchase_bill_landed_allocations(p_bill_id);

    SELECT COALESCE(
      SUM(
        ROUND(
          GREATEST(0, pbl.quantity)
          * COALESCE(NULLIF(pbl.unit_loaded_cost, 0), pbl.purchase_price, 0),
          2
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

  CREATE OR REPLACE FUNCTION public.compute_purchase_receive_capitalization(p_receive_id uuid)
  RETURNS TABLE (
    inventory_amount numeric,
    input_tax_amount numeric,
    grni_clearance_amount numeric
  )
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public
  AS $$
  DECLARE
    v_bill_id uuid;
    v_inventory numeric := 0;
    v_tax numeric := 0;
    v_unit numeric;
    r record;
  BEGIN
    inventory_amount := 0;
    input_tax_amount := 0;
    grni_clearance_amount := 0;

    IF p_receive_id IS NULL THEN
      RETURN NEXT;
      RETURN;
    END IF;

    SELECT purchase_bill_id INTO v_bill_id
    FROM public.erp_purchase_receives
    WHERE id = p_receive_id;

    IF v_bill_id IS NOT NULL THEN
      PERFORM public.refresh_purchase_bill_landed_allocations(v_bill_id);
    END IF;

    FOR r IN
      SELECT
        prl.bill_line_id,
        prl.accepted_qty,
        prl.purchase_price,
        prl.tax_rate_percent,
        prl.loaded_unit_cost
      FROM public.erp_purchase_receive_lines prl
      WHERE prl.purchase_receive_id = p_receive_id
        AND COALESCE(prl.accepted_qty, 0) > 0
    LOOP
      v_unit := COALESCE(
        NULLIF(r.loaded_unit_cost, 0),
        public.resolve_receive_line_loaded_unit_cost(r.bill_line_id, r.purchase_price),
        r.purchase_price,
        0
      );

      v_inventory := v_inventory
        + ROUND(GREATEST(0, r.accepted_qty) * v_unit, 2);

      v_tax := v_tax
        + ROUND(
          GREATEST(0, r.accepted_qty) * COALESCE(r.purchase_price, 0)
          * COALESCE(r.tax_rate_percent, 0) / 100,
          2
        );
    END LOOP;

    inventory_amount := GREATEST(0, v_inventory);
    input_tax_amount := GREATEST(0, v_tax);
    grni_clearance_amount := ROUND(inventory_amount + input_tax_amount, 2);

    RETURN NEXT;
  END;
  $$;

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
        WHEN COALESCE(p_ap_total, 0) <= 0 THEN GREATEST(0, COALESCE(p_stock, 0))
        WHEN ABS(
          ROUND(COALESCE(p_stock, 0) + COALESCE(p_tax, 0), 2)
          - ROUND(COALESCE(p_ap_total, 0), 2)
        ) <= 0.05
          THEN GREATEST(0, ROUND(COALESCE(p_ap_total, 0) - COALESCE(p_tax, 0), 2))
        ELSE GREATEST(0, COALESCE(p_stock, 0))
      END;
  $$;

  -- ─── Purchase bill journal (line-level stock path) ────────────────────────────

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
    v_lines jsonb;
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
      v_stock := public.compute_purchase_bill_inventory_amount(p_bill_id);
      v_stock := public.purchase_journal_balance_stock_to_ap(v_stock, v_tax, v_total);

      PERFORM public.ensure_system_ledger_account('STOCK', 'Stock');
      PERFORM public.ensure_system_ledger_account('ACCOUNTS_PAYABLE', 'Accounts Payable');
      PERFORM public.ensure_system_ledger_account('OVERSEAS_TAX_PAYABLE', 'Overseas Tax Payable');

      v_lines := jsonb_build_array(
        jsonb_build_object(
          'account_code', 'STOCK', 'debit', v_stock,
          'description', 'Purchase bill ' || v_number
        )
      );

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

  -- ─── Purchase receive journal (this receipt only) ─────────────────────────────

  CREATE OR REPLACE FUNCTION public.post_journal_for_purchase_receive(
    p_receive_id uuid,
    p_actor uuid DEFAULT auth.uid()
  )
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
  DECLARE
    v_existing uuid;
    v_store_id uuid;
    v_date date;
    v_number text;
    v_stock numeric;
    v_tax numeric;
    v_grni numeric;
    v_lines jsonb;
    cap record;
  BEGIN
    IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;

    SELECT id INTO v_existing
    FROM public.journal_entries
    WHERE source_entity_type = 'purchase_receive'
      AND source_entity_id = p_receive_id
      AND status = 'posted';
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;

    IF NOT public.is_posting_enabled('purchase_receive') THEN
      RETURN NULL;
    END IF;

    SELECT store_id, receive_date, receive_number
    INTO v_store_id, v_date, v_number
    FROM public.erp_purchase_receives
    WHERE id = p_receive_id AND status = 'finalized';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Purchase receive not found or not finalized';
    END IF;

    SELECT * INTO cap
    FROM public.compute_purchase_receive_capitalization(p_receive_id);

    v_stock := COALESCE(cap.inventory_amount, 0);
    v_tax := COALESCE(cap.input_tax_amount, 0);
    v_grni := COALESCE(cap.grni_clearance_amount, 0);

    IF v_grni <= 0 THEN
      RETURN NULL;
    END IF;

    PERFORM public.require_store_access(v_store_id, p_actor);
    PERFORM public.ensure_system_ledger_account('STOCK', 'Stock');
    PERFORM public.ensure_system_ledger_account('GOODS_RECEIPT_PENDING', 'Goods Receipt Pending');
    PERFORM public.ensure_system_ledger_account('OVERSEAS_TAX_PAYABLE', 'Overseas Tax Payable');

    v_lines := jsonb_build_array(
      jsonb_build_object(
        'account_code', 'STOCK', 'debit', v_stock,
        'description', 'Receive ' || v_number
      )
    );

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
        'account_code', 'GOODS_RECEIPT_PENDING', 'credit', v_grni,
        'description', 'GRNI clearance'
      )
    );

    RETURN public.create_posted_journal_entry(
      v_date, 'Purchase receive ' || v_number, v_store_id, 'purchase_receive', p_receive_id, v_lines, p_actor
    );
  END;
  $$;

  -- Persist per-receive landed share on lines (audit + partial receive capitalization)
  ALTER TABLE public.erp_purchase_receive_lines
    ADD COLUMN IF NOT EXISTS landed_cost_allocated numeric NOT NULL DEFAULT 0;

  CREATE OR REPLACE FUNCTION public.inventory_apply_purchase_receive_stock(
    p_receive_id uuid,
    p_multiplier integer DEFAULT 1,
    p_user_id uuid DEFAULT auth.uid()
  )
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
  DECLARE
    r record;
    v_store_id uuid;
    v_bill_id uuid;
    v_delta numeric;
    v_unit numeric;
    v_landed_share numeric;
    v_bill_qty numeric;
    v_bill_landed numeric;
    v_actor uuid;
  BEGIN
    v_actor := COALESCE(p_user_id, auth.uid());

    IF p_receive_id IS NULL OR p_multiplier NOT IN (-1, 1) THEN
      RAISE EXCEPTION 'Invalid purchase receive stock request';
    END IF;

    IF v_actor IS NULL OR NOT public.is_staff_user(v_actor) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;

    SELECT store_id, purchase_bill_id
    INTO v_store_id, v_bill_id
    FROM public.erp_purchase_receives
    WHERE id = p_receive_id;

    PERFORM public.require_store_access(v_store_id, v_actor);

    IF v_bill_id IS NOT NULL THEN
      PERFORM public.copy_po_landed_costs_to_bill(
        (SELECT po_id FROM public.erp_purchase_bills WHERE id = v_bill_id),
        v_bill_id
      );
      PERFORM public.refresh_purchase_bill_landed_allocations(v_bill_id);
    END IF;

    FOR r IN
      SELECT
        prl.id AS receive_line_id,
        prl.bill_line_id,
        prl.purchase_price,
        prl.loaded_unit_cost,
        prl.accepted_qty,
        COALESCE(prl.product_id, pv.product_id) AS product_id
      FROM public.erp_purchase_receive_lines prl
      LEFT JOIN public.product_variants pv ON pv.id = prl.variant_id
      WHERE prl.purchase_receive_id = p_receive_id
        AND COALESCE(prl.product_id, pv.product_id) IS NOT NULL
        AND COALESCE(prl.accepted_qty, 0) > 0
    LOOP
      v_unit := COALESCE(
        NULLIF(r.loaded_unit_cost, 0),
        public.resolve_receive_line_loaded_unit_cost(r.bill_line_id, r.purchase_price)
      );

      v_landed_share := 0;
      IF r.bill_line_id IS NOT NULL AND p_multiplier = 1 THEN
        SELECT quantity, landed_cost_allocated
        INTO v_bill_qty, v_bill_landed
        FROM public.erp_purchase_bill_lines
        WHERE id = r.bill_line_id;

        IF COALESCE(v_bill_qty, 0) > 0 AND COALESCE(v_bill_landed, 0) > 0 THEN
          v_landed_share := ROUND(
            v_bill_landed * (GREATEST(0, r.accepted_qty) / v_bill_qty),
            2
          );
        END IF;
      END IF;

      IF p_multiplier = 1 THEN
        UPDATE public.erp_purchase_receive_lines
        SET
          loaded_unit_cost = v_unit,
          landed_cost_allocated = v_landed_share
        WHERE id = r.receive_line_id;
      ELSE
        v_unit := COALESCE(NULLIF(r.loaded_unit_cost, 0), v_unit);
      END IF;

      v_delta := r.accepted_qty * p_multiplier;

      PERFORM public.store_product_inventory_apply_receipt_cost(
        v_store_id, r.product_id, v_delta, v_unit, v_actor
      );

      PERFORM public.log_product_stock_movement(
        r.product_id, v_delta, 'purchase', p_receive_id, 'purchase_receive',
        'Purchase Receive', v_store_id, NULL, v_unit, v_actor
      );
    END LOOP;
  END;
  $$;

  GRANT EXECUTE ON FUNCTION public.compute_purchase_bill_inventory_amount(uuid) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.compute_purchase_receive_capitalization(uuid) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.purchase_journal_balance_stock_to_ap(numeric, numeric, numeric) TO authenticated;

  COMMIT;
