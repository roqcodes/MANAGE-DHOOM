-- Opening stock voucher date = calendar day of save (no user backdating).

BEGIN;

CREATE OR REPLACE FUNCTION public.get_erp_opening_stock_worksheet(
  p_store_id uuid,
  p_search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pending jsonb := '[]'::jsonb;
  v_recorded jsonb := '[]'::jsonb;
  v_q text;
BEGIN
  IF v_uid IS NULL OR NOT public.is_staff_user(v_uid) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.require_store_access(p_store_id, v_uid);

  v_q := NULLIF(btrim(p_search), '');

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.product_name), '[]'::jsonb)
  INTO v_pending
  FROM (
    SELECT
      p.id AS product_id,
      p.name AS product_name,
      p.barcode,
      COALESCE(p.purchase_price, 0) AS default_unit_cost
    FROM public.products p
    WHERE p.is_active = true
      AND p.item_type = 'goods'
      AND NOT EXISTS (
        SELECT 1 FROM public.stock_movements sm
        WHERE sm.store_id = p_store_id AND sm.product_id = p.id
      )
      AND COALESCE(
        (
          SELECT spi.stock
          FROM public.store_product_inventory spi
          WHERE spi.store_id = p_store_id AND spi.product_id = p.id
        ),
        0
      ) = 0
      AND NOT EXISTS (
        SELECT 1
        FROM public.erp_opening_stock_lines ol
        JOIN public.erp_opening_stocks o ON o.id = ol.opening_id
        WHERE o.store_id = p_store_id
          AND ol.product_id = p.id
          AND o.status = 'finalized'
      )
      AND (
        v_q IS NULL
        OR p.name ILIKE '%' || v_q || '%'
        OR p.barcode ILIKE '%' || v_q || '%'
      )
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.product_name), '[]'::jsonb)
  INTO v_recorded
  FROM (
    SELECT
      o.id AS opening_id,
      ol.id AS line_id,
      ol.product_id,
      p.name AS product_name,
      p.barcode,
      ol.quantity,
      ol.unit_cost,
      ol.line_total,
      o.opening_number,
      o.opening_date,
      public.erp_opening_stock_product_locked(p_store_id, ol.product_id) AS locked
    FROM public.erp_opening_stock_lines ol
    JOIN public.erp_opening_stocks o ON o.id = ol.opening_id
    JOIN public.products p ON p.id = ol.product_id
    WHERE o.store_id = p_store_id
      AND o.status = 'finalized'
      AND (
        v_q IS NULL
        OR p.name ILIKE '%' || v_q || '%'
        OR p.barcode ILIKE '%' || v_q || '%'
        OR o.opening_number ILIKE '%' || v_q || '%'
      )
  ) t;

  RETURN jsonb_build_object(
    'pending', v_pending,
    'recorded', v_recorded
  );
END;
$$;

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
    CURRENT_DATE,
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

CREATE OR REPLACE FUNCTION public.create_erp_opening_stock(
  p_store_id uuid,
  p_opening_date date,
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
  v_opening_id uuid;
  v_opening_number text;
  v_line jsonb;
  v_qty numeric;
  v_cost numeric;
  v_total numeric;
  v_doc_total numeric := 0;
  v_product_id uuid;
  v_seen_products uuid[] := ARRAY[]::uuid[];
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_created_by);

  IF jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one line is required';
  END IF;

  SELECT t.out_id, t.out_ref INTO v_opening_id, v_opening_number
  FROM public.erp_next_document_ref('opening_stock') AS t;

  INSERT INTO public.erp_opening_stocks (
    id, opening_number, store_id, opening_date, status, note, created_by
  )
  VALUES (
    v_opening_id,
    v_opening_number,
    p_store_id,
    CURRENT_DATE,
    CASE WHEN p_finalize THEN 'finalized' ELSE 'draft' END,
    p_note,
    p_created_by
  );

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_qty := COALESCE((v_line ->> 'quantity')::numeric, 0);
    v_cost := COALESCE((v_line ->> 'unit_cost')::numeric, 0);
    v_product_id := NULLIF(v_line ->> 'product_id', '')::uuid;

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'Product is required for opening stock line';
    END IF;

    IF v_qty <= 0 OR v_cost <= 0 THEN
      RAISE EXCEPTION 'Quantity and unit cost must be positive';
    END IF;

    IF v_product_id = ANY (v_seen_products) THEN
      RAISE EXCEPTION 'Duplicate product on opening stock document';
    END IF;
    v_seen_products := v_seen_products || v_product_id;

    v_total := ROUND(v_qty * v_cost, 2);
    v_doc_total := v_doc_total + v_total;

    INSERT INTO public.erp_opening_stock_lines (
      opening_id, product_id, quantity, unit_cost, line_total
    )
    VALUES (
      v_opening_id, v_product_id, v_qty, v_cost, v_total
    );
  END LOOP;

  UPDATE public.erp_opening_stocks
  SET total_value = v_doc_total, updated_at = now()
  WHERE id = v_opening_id;

  IF p_finalize THEN
    PERFORM public.finalize_erp_opening_stock(v_opening_id, p_created_by);
  END IF;

  RETURN v_opening_id;
END;
$$;

COMMIT;