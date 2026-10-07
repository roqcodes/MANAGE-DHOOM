-- W4: POS header totals must match sum(line final_price × quantity) + tax − discount semantics.
-- Prerequisites:
--   20261002220000_pos_header_total_integrity.sql
--   20261002230000_order_items_allow_multiple_lines_per_variant.sql
-- Ends with ROLLBACK.

BEGIN;

DO $$
DECLARE
  v_store uuid;
  v_variant uuid;
  v_product uuid;
  v_staff uuid;
  v_key uuid := gen_random_uuid();
  v_result jsonb;
  v_order_id uuid;
  v_order_total numeric;
  v_order_subtotal numeric;
  v_invoice_total numeric;
  v_lines jsonb;
  v_walk_in_id uuid := 'a0000000-0000-4000-8000-000000000001';
BEGIN
  SELECT id INTO v_staff FROM public.users WHERE role::text IN ('admin', 'manager') LIMIT 1;
  IF v_staff IS NULL THEN
    RAISE EXCEPTION 'TEST_SKIP: no staff user';
  END IF;

  SELECT id INTO v_store FROM public.stores ORDER BY created_at LIMIT 1;
  IF v_store IS NULL THEN
    RAISE EXCEPTION 'TEST_SKIP: no store';
  END IF;

  PERFORM public.ensure_walk_in_customer();

  IF NOT public.user_has_store_access(v_staff, v_store) THEN
    INSERT INTO public.user_store_access (user_id, store_id)
    VALUES (v_staff, v_store)
    ON CONFLICT (user_id, store_id) DO NOTHING;
  END IF;

  SELECT pv.id, pv.product_id
  INTO v_variant, v_product
  FROM public.inventory i
  JOIN public.product_variants pv ON pv.id = i.variant_id
  WHERE i.store_id = v_store
    AND pv.product_id IS NOT NULL
    AND (i.stock - COALESCE(i.reserved_stock, 0)) >= 1
  ORDER BY (i.stock - COALESCE(i.reserved_stock, 0)) DESC
  LIMIT 1;

  IF v_variant IS NULL THEN
    SELECT id, product_id
    INTO v_variant, v_product
    FROM public.product_variants
    WHERE product_id IS NOT NULL
    ORDER BY created_at NULLS LAST
    LIMIT 1;
  END IF;

  IF v_variant IS NULL THEN
    RAISE EXCEPTION 'TEST_SKIP: no product variant — add catalog data first';
  END IF;

  INSERT INTO public.inventory (
    store_id, variant_id, stock, reserved_stock, reorder_point, reorder_quantity, updated_at
  )
  VALUES (v_store, v_variant, 10, 0, 0, 1, now())
  ON CONFLICT (store_id, variant_id) DO UPDATE
  SET
    stock = GREATEST(public.inventory.stock, 10),
    reserved_stock = LEAST(COALESCE(public.inventory.reserved_stock, 0), public.inventory.stock),
    updated_at = now();

  IF COALESCE(
    (
      SELECT stock - COALESCE(reserved_stock, 0)
      FROM public.inventory
      WHERE store_id = v_store AND variant_id = v_variant
    ),
    0
  ) < 3 THEN
    UPDATE public.inventory
    SET stock = 10, reserved_stock = 0, updated_at = now()
    WHERE store_id = v_store AND variant_id = v_variant;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);

  -- Two lines, same variant, different cashier prices: 90×2 + 50×1 = 230
  v_lines := jsonb_build_array(
    jsonb_build_object(
      'variant_id', v_variant,
      'product_id', v_product,
      'quantity', 2,
      'unit_price', 90,
      'final_price', 90,
      'base_price', 1,
      'margin_amount', 89,
      'product_name', 'Line A'
    ),
    jsonb_build_object(
      'variant_id', v_variant,
      'product_id', v_product,
      'quantity', 1,
      'unit_price', 50,
      'final_price', 50,
      'base_price', 1,
      'margin_amount', 49,
      'product_name', 'Line B'
    )
  );

  -- Malicious header totals (must be ignored; server derives 230)
  v_result := public.complete_pos_counter_sale(
    v_key, v_store, v_lines,
    1, 0, 0, 1,
    NULL, 'W4 buyer', NULL, NULL, NULL, v_staff
  );

  v_order_id := (v_result ->> 'order_id')::uuid;
  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'TEST_FAIL: no order_id';
  END IF;

  IF (v_result ->> 'total_amount')::numeric <> 230 THEN
    RAISE EXCEPTION 'TEST_FAIL: RPC total_amount expected 230, got %', v_result ->> 'total_amount';
  END IF;

  SELECT total_amount, subtotal
  INTO v_order_total, v_order_subtotal
  FROM public.orders
  WHERE id = v_order_id;

  IF v_order_total <> 230 THEN
    RAISE EXCEPTION 'TEST_FAIL: order.total_amount expected 230, got %', v_order_total;
  END IF;

  IF v_order_subtotal <> 230 THEN
    RAISE EXCEPTION 'TEST_FAIL: order.subtotal expected 230 (discount 0), got %', v_order_subtotal;
  END IF;

  SELECT i.total_amount INTO v_invoice_total
  FROM public.invoices i
  WHERE i.order_id = v_order_id
  ORDER BY i.created_at DESC
  LIMIT 1;

  IF v_invoice_total IS NULL OR v_invoice_total <> 230 THEN
    RAISE EXCEPTION 'TEST_FAIL: invoice total expected 230, got %', v_invoice_total;
  END IF;

  -- Negative price must roll back entire sale
  BEGIN
    PERFORM public.complete_pos_counter_sale(
      gen_random_uuid(), v_store,
      jsonb_build_array(
        jsonb_build_object(
          'variant_id', v_variant,
          'product_id', v_product,
          'quantity', 1,
          'final_price', -1,
          'base_price', 0,
          'margin_amount', 0,
          'product_name', 'Bad'
        )
      ),
      10, 0, 0, 10, NULL, NULL, NULL, NULL, NULL, v_staff
    );
    RAISE EXCEPTION 'TEST_FAIL: negative price should fail';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT ILIKE '%POS_CHECKOUT_INVALID%' THEN
        RAISE;
      END IF;
  END;

  RAISE NOTICE 'POS header total integrity (W4) tests passed.';
END $$;

ROLLBACK;
