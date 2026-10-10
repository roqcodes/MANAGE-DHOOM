-- Fix typo: erp_stock_adjustments uses total_add_cost / total_remove_cost (not add_cost_total).

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
  v_product_id uuid;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_created_by);

  IF jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one line is required';
  END IF;

  SELECT t.out_id, t.out_ref INTO v_adj_id, v_adj_number
  FROM public.erp_next_document_ref('stock_adjustment') AS t;

  INSERT INTO public.erp_stock_adjustments (
    id, adjustment_number, store_id, adjustment_date, status, note, created_by
  )
  VALUES (
    v_adj_id, v_adj_number, p_store_id, p_adjustment_date,
    CASE WHEN p_finalize THEN 'finalized' ELSE 'draft' END,
    p_note, p_created_by
  );

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_direction := v_line ->> 'direction';
    v_qty := COALESCE((v_line ->> 'quantity')::numeric, 0);
    v_cost := COALESCE((v_line ->> 'purchase_cost')::numeric, 0);
    v_product_id := NULLIF(v_line ->> 'product_id', '')::uuid;

    IF v_product_id IS NULL THEN
      v_product_id := (
        SELECT product_id FROM public.product_variants
        WHERE id = NULLIF(v_line ->> 'variant_id', '')::uuid
      );
    END IF;

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'Product is required for adjustment line';
    END IF;

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
      adjustment_id, variant_id, product_id, direction, quantity, purchase_cost, line_total
    )
    VALUES (
      v_adj_id,
      NULLIF(v_line ->> 'variant_id', '')::uuid,
      v_product_id,
      v_direction, v_qty, v_cost, v_total
    );

    IF v_direction = 'add' THEN
      v_add_cost := v_add_cost + v_total;
    ELSE
      v_remove_cost := v_remove_cost + v_total;
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
