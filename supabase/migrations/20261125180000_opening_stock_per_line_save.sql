-- Per-item opening stock save (one voucher line per save).

BEGIN;

CREATE OR REPLACE FUNCTION public.save_erp_opening_stock_line(
  p_store_id uuid,
  p_opening_date date,
  p_product_id uuid,
  p_quantity numeric,
  p_unit_cost numeric,
  p_opening_id uuid DEFAULT NULL,
  p_line_id uuid DEFAULT NULL,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lines jsonb;
  v_opening_id uuid;
  v_product_name text;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_quantity <= 0 OR p_unit_cost <= 0 THEN
    RAISE EXCEPTION 'Quantity and unit cost must be positive';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_actor);

  IF p_opening_id IS NOT NULL AND p_line_id IS NOT NULL THEN
    PERFORM public.revise_erp_opening_stock_line(
      p_opening_id, p_line_id, p_quantity, p_unit_cost, p_actor
    );
    RETURN jsonb_build_object(
      'mode', 'revise',
      'opening_id', p_opening_id,
      'line_id', p_line_id,
      'product_id', p_product_id
    );
  END IF;

  IF public.erp_opening_stock_product_locked(p_store_id, p_product_id) THEN
    RAISE EXCEPTION 'This item already has purchases, sales, or other inventory activity';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.stock_movements sm
    WHERE sm.store_id = p_store_id AND sm.product_id = p_product_id
  ) THEN
    RAISE EXCEPTION 'This item is no longer eligible for new opening stock';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.erp_opening_stock_lines ol
    JOIN public.erp_opening_stocks o ON o.id = ol.opening_id
    WHERE o.store_id = p_store_id
      AND ol.product_id = p_product_id
      AND o.status = 'finalized'
  ) THEN
    RAISE EXCEPTION 'Opening stock is already recorded for this item';
  END IF;

  SELECT name INTO v_product_name FROM public.products WHERE id = p_product_id;

  v_lines := jsonb_build_array(
    jsonb_build_object(
      'product_id', p_product_id,
      'quantity', p_quantity,
      'unit_cost', p_unit_cost
    )
  );

  v_opening_id := public.create_erp_opening_stock(
    p_store_id,
    COALESCE(p_opening_date, CURRENT_DATE),
    v_lines,
    'Opening stock — ' || COALESCE(v_product_name, p_product_id::text),
    true,
    p_actor
  );

  RETURN jsonb_build_object(
    'mode', 'create',
    'opening_id', v_opening_id,
    'product_id', p_product_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_erp_opening_stock_worksheet(
  p_store_id uuid,
  p_opening_date date,
  p_pending jsonb,
  p_updates jsonb,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_line jsonb;
  v_product_id uuid;
  v_qty numeric;
  v_cost numeric;
  v_opening_id uuid;
  v_opening_line_id uuid;
  v_saved_pending integer := 0;
  v_updated integer := 0;
  v_last_doc uuid;
BEGIN
  IF p_pending IS NOT NULL THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_pending)
    LOOP
      v_product_id := NULLIF(v_line ->> 'product_id', '')::uuid;
      v_qty := COALESCE((v_line ->> 'quantity')::numeric, 0);
      v_cost := COALESCE((v_line ->> 'unit_cost')::numeric, 0);
      IF v_product_id IS NULL OR v_qty <= 0 OR v_cost <= 0 THEN
        CONTINUE;
      END IF;
      PERFORM public.save_erp_opening_stock_line(
        p_store_id, p_opening_date, v_product_id, v_qty, v_cost, NULL, NULL, p_actor
      );
      v_saved_pending := v_saved_pending + 1;
    END LOOP;
  END IF;

  IF p_updates IS NOT NULL THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_updates)
    LOOP
      v_opening_id := NULLIF(v_line ->> 'opening_id', '')::uuid;
      v_opening_line_id := NULLIF(v_line ->> 'line_id', '')::uuid;
      v_product_id := NULLIF(v_line ->> 'product_id', '')::uuid;
      v_qty := COALESCE((v_line ->> 'quantity')::numeric, 0);
      v_cost := COALESCE((v_line ->> 'unit_cost')::numeric, 0);
      IF v_opening_id IS NULL OR v_opening_line_id IS NULL OR v_product_id IS NULL THEN
        CONTINUE;
      END IF;
      PERFORM public.save_erp_opening_stock_line(
        p_store_id, p_opening_date, v_product_id, v_qty, v_cost, v_opening_id, v_opening_line_id, p_actor
      );
      v_updated := v_updated + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'saved_pending', v_saved_pending,
    'updated', v_updated,
    'opening_document_id', v_last_doc
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_erp_opening_stock_line(
  uuid, date, uuid, numeric, numeric, uuid, uuid, uuid
) TO authenticated;

COMMIT;