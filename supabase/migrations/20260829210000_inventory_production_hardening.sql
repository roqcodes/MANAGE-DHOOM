  -- Inventory production hardening: transfer request approval workflow, stock adjustment cost rules.

  BEGIN;

  ALTER TABLE public.erp_transfer_requests
    ADD COLUMN IF NOT EXISTS transfer_id uuid REFERENCES public.erp_store_transfers (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS approved_at timestamptz,
    ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
    ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES public.users (id) ON DELETE SET NULL;

  ALTER TABLE public.erp_transfer_requests
    DROP CONSTRAINT IF EXISTS erp_transfer_requests_status_check;

  ALTER TABLE public.erp_transfer_requests
    ADD CONSTRAINT erp_transfer_requests_status_check
    CHECK (status IN ('draft', 'submitted', 'linked', 'approved', 'rejected', 'cancelled'));

  CREATE OR REPLACE FUNCTION public.create_erp_stock_adjustment(
    p_store_id uuid,
    p_adjustment_date date,
    p_lines jsonb,
    p_note text DEFAULT NULL,
    p_finalize boolean DEFAULT false,
    p_created_by uuid DEFAULT auth.uid()
  )
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
  DECLARE
    v_adj_id uuid;
    v_adj_number text;
    v_line jsonb;
    v_qty numeric;
    v_cost numeric;
    v_total numeric;
    v_add_cost numeric := 0;
    v_remove_cost numeric := 0;
    v_direction text;
  BEGIN
    IF NOT public.is_staff_user(p_created_by) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;

    PERFORM public.require_store_access(p_store_id, p_created_by);

    IF jsonb_array_length(p_lines) = 0 THEN
      RAISE EXCEPTION 'At least one line is required';
    END IF;

    v_adj_number := public.next_erp_document_number('stock_adjustment');

    INSERT INTO public.erp_stock_adjustments (
      adjustment_number, store_id, adjustment_date, status, note, created_by
    )
    VALUES (
      v_adj_number, p_store_id, p_adjustment_date,
      CASE WHEN p_finalize THEN 'finalized' ELSE 'draft' END,
      p_note, p_created_by
    )
    RETURNING id INTO v_adj_id;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
      v_direction := v_line ->> 'direction';
      v_qty := COALESCE((v_line ->> 'quantity')::numeric, 0);
      v_cost := COALESCE((v_line ->> 'purchase_cost')::numeric, 0);

      IF v_qty <= 0 OR v_direction NOT IN ('add', 'remove') THEN
        RAISE EXCEPTION 'Invalid adjustment line';
      END IF;

      IF v_direction = 'add' AND v_cost <= 0 THEN
        RAISE EXCEPTION 'Purchase cost is required when adding stock';
      END IF;

      IF v_direction = 'remove' THEN
        v_cost := 0;
      END IF;

      v_total := CASE WHEN v_direction = 'add' THEN ROUND(v_qty * v_cost, 2) ELSE 0 END;

      INSERT INTO public.erp_stock_adjustment_lines (
        adjustment_id, variant_id, direction, quantity, purchase_cost, line_total
      )
      VALUES (
        v_adj_id,
        (v_line ->> 'variant_id')::uuid,
        v_direction,
        v_qty,
        v_cost,
        v_total
      );

      IF v_direction = 'add' THEN
        v_add_cost := v_add_cost + v_total;
      END IF;
    END LOOP;

    UPDATE public.erp_stock_adjustments
    SET total_add_cost = v_add_cost, total_remove_cost = v_remove_cost, updated_at = now()
    WHERE id = v_adj_id;

    IF p_finalize THEN
      PERFORM public.finalize_erp_stock_adjustment(v_adj_id, p_created_by);
    END IF;

    RETURN v_adj_id;
  END;
  $$;

  CREATE OR REPLACE FUNCTION public.approve_erp_transfer_request(
    p_request_id uuid,
    p_approved_by uuid DEFAULT auth.uid()
  )
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
  DECLARE
    v_status text;
    v_from uuid;
    v_to uuid;
    v_request_date date;
    v_transfer_id uuid;
    v_lines jsonb := '[]'::jsonb;
    r record;
    v_stock numeric;
  BEGIN
    IF NOT public.is_staff_user(p_approved_by) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;

    SELECT status, from_store_id, to_store_id, request_date, transfer_id
    INTO v_status, v_from, v_to, v_request_date, v_transfer_id
    FROM public.erp_transfer_requests
    WHERE id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Transfer request not found';
    END IF;

    IF v_status = 'approved' AND v_transfer_id IS NOT NULL THEN
      RETURN v_transfer_id;
    END IF;

    IF v_status <> 'submitted' THEN
      RAISE EXCEPTION 'Only submitted requests can be approved';
    END IF;

    PERFORM public.require_store_access(v_from, p_approved_by);

    FOR r IN
      SELECT variant_id, quantity, transfer_price, sales_price, average_purchase_cost
      FROM public.erp_transfer_request_lines
      WHERE request_id = p_request_id
    LOOP
      SELECT COALESCE(stock, 0) INTO v_stock
      FROM public.store_inventory
      WHERE store_id = v_from AND variant_id = r.variant_id;

      IF COALESCE(v_stock, 0) < r.quantity THEN
        RAISE EXCEPTION 'Insufficient stock at supplying store for one or more items';
      END IF;

      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'variant_id', r.variant_id,
        'quantity', r.quantity,
        'purchase_price', r.average_purchase_cost,
        'sales_price', r.sales_price,
        'markup_percent', 0,
        'markup_type', '',
        'markup_amount', 0,
        'transfer_price', r.transfer_price
      ));
    END LOOP;

    v_transfer_id := public.create_erp_store_transfer(
      v_from,
      v_to,
      COALESCE(v_request_date, CURRENT_DATE),
      v_lines,
      NULL,
      p_request_id,
      p_approved_by
    );

    PERFORM public.complete_erp_store_transfer(v_transfer_id, p_approved_by);

    UPDATE public.erp_transfer_requests
    SET
      status = 'approved',
      transfer_id = v_transfer_id,
      approved_at = now(),
      approved_by = p_approved_by,
      updated_at = now()
    WHERE id = p_request_id;

    RETURN v_transfer_id;
  END;
  $$;

  CREATE OR REPLACE FUNCTION public.reject_erp_transfer_request(
    p_request_id uuid,
    p_rejected_by uuid DEFAULT auth.uid()
  )
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
  DECLARE
    v_status text;
    v_from uuid;
  BEGIN
    IF NOT public.is_staff_user(p_rejected_by) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;

    SELECT status, from_store_id INTO v_status, v_from
    FROM public.erp_transfer_requests
    WHERE id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Transfer request not found';
    END IF;

    IF v_status <> 'submitted' THEN
      RAISE EXCEPTION 'Only submitted requests can be rejected';
    END IF;

    PERFORM public.require_store_access(v_from, p_rejected_by);

    UPDATE public.erp_transfer_requests
    SET
      status = 'rejected',
      rejected_at = now(),
      rejected_by = p_rejected_by,
      updated_at = now()
    WHERE id = p_request_id;
  END;
  $$;

  GRANT EXECUTE ON FUNCTION public.approve_erp_transfer_request(uuid, uuid) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.reject_erp_transfer_request(uuid, uuid) TO authenticated;

  COMMIT;
