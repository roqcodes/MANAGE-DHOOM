-- Opening stock worksheet: list eligible products, bulk save, edit until other movements exist.

BEGIN;

CREATE OR REPLACE FUNCTION public.erp_opening_stock_product_locked(
  p_store_id uuid,
  p_product_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.stock_movements sm
    WHERE sm.store_id = p_store_id
      AND sm.product_id = p_product_id
      AND sm.type <> 'opening'
  );
$$;

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
    'recorded', v_recorded,
    'default_opening_date', CURRENT_DATE
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.revise_erp_opening_stock_line(
  p_opening_id uuid,
  p_line_id uuid,
  p_quantity numeric,
  p_unit_cost numeric,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
  v_product_id uuid;
  v_old_qty numeric;
  v_old_cost numeric;
  v_total numeric;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_quantity <= 0 OR p_unit_cost <= 0 THEN
    RAISE EXCEPTION 'Quantity and unit cost must be positive';
  END IF;

  SELECT o.store_id, ol.product_id, ol.quantity, ol.unit_cost
  INTO v_store_id, v_product_id, v_old_qty, v_old_cost
  FROM public.erp_opening_stock_lines ol
  JOIN public.erp_opening_stocks o ON o.id = ol.opening_id
  WHERE ol.id = p_line_id
    AND ol.opening_id = p_opening_id
    AND o.status = 'finalized'
  FOR UPDATE OF o;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Opening stock line not found or not finalized';
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  IF public.erp_opening_stock_product_locked(v_store_id, v_product_id) THEN
    RAISE EXCEPTION
      'Cannot edit opening stock after purchases, sales, or other inventory activity for this item';
  END IF;

  IF p_quantity = v_old_qty AND p_unit_cost = v_old_cost THEN
    RETURN;
  END IF;

  UPDATE public.erp_opening_stock_lines
  SET
    quantity = p_quantity,
    unit_cost = p_unit_cost,
    line_total = ROUND(p_quantity * p_unit_cost, 2)
  WHERE id = p_line_id;

  UPDATE public.store_product_inventory
  SET
    stock = p_quantity,
    purchase_price = ROUND(p_unit_cost, 4),
    opening_stock = p_quantity,
    updated_at = now()
  WHERE store_id = v_store_id AND product_id = v_product_id;

  UPDATE public.stock_movements
  SET
    quantity = p_quantity,
    transaction_price = p_unit_cost
  WHERE store_id = v_store_id
    AND product_id = v_product_id
    AND type = 'opening'
    AND reference_type = 'opening_stock'
    AND reference_id = p_opening_id;

  SELECT COALESCE(SUM(line_total), 0)
  INTO v_total
  FROM public.erp_opening_stock_lines
  WHERE opening_id = p_opening_id;

  UPDATE public.erp_opening_stocks
  SET total_value = v_total, updated_at = now()
  WHERE id = p_opening_id;

  PERFORM public.void_journals_for_entity('opening_stock', p_opening_id);
  PERFORM public.post_journal_for_opening_stock(p_opening_id, p_actor);
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
  v_lines jsonb := '[]'::jsonb;
  v_saved_pending integer := 0;
  v_updated integer := 0;
  v_opening_id uuid;
  v_opening_line_id uuid;
  v_opening_doc_id uuid;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_actor);

  IF p_pending IS NOT NULL AND jsonb_array_length(p_pending) > 0 THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_pending)
    LOOP
      v_product_id := NULLIF(v_line ->> 'product_id', '')::uuid;
      v_qty := COALESCE((v_line ->> 'quantity')::numeric, 0);
      v_cost := COALESCE((v_line ->> 'unit_cost')::numeric, 0);

      IF v_product_id IS NULL OR v_qty <= 0 OR v_cost <= 0 THEN
        CONTINUE;
      END IF;

      IF public.erp_opening_stock_product_locked(p_store_id, v_product_id) THEN
        RAISE EXCEPTION 'Item % already has inventory activity; use Stock Adjustment', v_product_id;
      END IF;

      IF EXISTS (
        SELECT 1 FROM public.stock_movements sm
        WHERE sm.store_id = p_store_id AND sm.product_id = v_product_id
      ) THEN
        RAISE EXCEPTION 'Item % is not eligible for new opening stock', v_product_id;
      END IF;

      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object(
          'product_id', v_product_id,
          'quantity', v_qty,
          'unit_cost', v_cost
        )
      );
    END LOOP;

    IF jsonb_array_length(v_lines) > 0 THEN
      v_opening_doc_id := public.create_erp_opening_stock(
        p_store_id,
        COALESCE(p_opening_date, CURRENT_DATE),
        v_lines,
        'Opening stock worksheet',
        true,
        p_actor
      );
      v_saved_pending := jsonb_array_length(v_lines);
    END IF;
  END IF;

  IF p_updates IS NOT NULL AND jsonb_array_length(p_updates) > 0 THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_updates)
    LOOP
      v_opening_id := NULLIF(v_line ->> 'opening_id', '')::uuid;
      v_opening_line_id := NULLIF(v_line ->> 'line_id', '')::uuid;
      v_qty := COALESCE((v_line ->> 'quantity')::numeric, 0);
      v_cost := COALESCE((v_line ->> 'unit_cost')::numeric, 0);

      IF v_opening_id IS NULL OR v_opening_line_id IS NULL THEN
        CONTINUE;
      END IF;

      PERFORM public.revise_erp_opening_stock_line(
        v_opening_id, v_opening_line_id, v_qty, v_cost, p_actor
      );
      v_updated := v_updated + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'saved_pending', v_saved_pending,
    'updated', v_updated,
    'opening_document_id', v_opening_doc_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.erp_opening_stock_product_locked(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_opening_stock_worksheet(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revise_erp_opening_stock_line(uuid, uuid, numeric, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_erp_opening_stock_worksheet(uuid, date, jsonb, jsonb, uuid) TO authenticated;

COMMIT;