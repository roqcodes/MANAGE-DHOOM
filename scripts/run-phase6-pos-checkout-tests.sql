-- Phase 6: POS idempotent replay returns totals (ROLLBACK).
-- Requires: 20261002210000_fix_ensure_walk_in_customer_pgcrypto (or walk-in already seeded).

BEGIN;

DO $$
DECLARE
  v_staff uuid;
  v_store uuid;
  v_variant uuid;
  v_product uuid;
  v_key uuid := gen_random_uuid();
  v_result jsonb;
  v_result2 jsonb;
  v_order uuid;
BEGIN
  SELECT id INTO v_staff FROM public.users WHERE role::text IN ('admin', 'manager') LIMIT 1;
  SELECT id INTO v_store FROM public.stores WHERE is_active = true LIMIT 1;
  SELECT id, product_id INTO v_variant, v_product
  FROM public.product_variants
  WHERE product_id IS NOT NULL
  LIMIT 1;

  IF v_staff IS NULL OR v_store IS NULL OR v_variant IS NULL THEN
    RAISE NOTICE 'TEST_SKIP: missing staff/store/variant';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);

  INSERT INTO public.inventory (store_id, variant_id, stock, reserved_stock, reorder_quantity, updated_at)
  VALUES (v_store, v_variant, 50, 0, 1, now())
  ON CONFLICT (store_id, variant_id)
  DO UPDATE SET stock = GREATEST(public.inventory.stock, 50), reorder_quantity = GREATEST(public.inventory.reorder_quantity, 1);

  v_result := public.complete_pos_counter_sale(
    v_key, v_store,
    jsonb_build_array(jsonb_build_object(
      'variant_id', v_variant,
      'product_id', v_product,
      'quantity', 1,
      'unit_price', 10,
      'final_price', 10,
      'base_price', 5,
      'margin_amount', 5,
      'product_name', 'Phase6 test'
    )),
    10, 0, 0, 10,
    NULL, NULL, NULL, NULL, NULL,
    v_staff
  );

  v_order := (v_result ->> 'order_id')::uuid;
  IF v_order IS NULL OR (v_result ->> 'idempotent_replay')::boolean THEN
    RAISE EXCEPTION 'TEST_FAIL: first checkout';
  END IF;

  v_result2 := public.complete_pos_counter_sale(
    v_key, v_store,
    jsonb_build_array(jsonb_build_object(
      'variant_id', v_variant,
      'product_id', v_product,
      'quantity', 1,
      'unit_price', 10,
      'final_price', 10,
      'base_price', 5,
      'margin_amount', 5,
      'product_name', 'Phase6 test'
    )),
    10, 0, 0, 10,
    NULL, NULL, NULL, NULL, NULL,
    v_staff
  );

  IF NOT COALESCE((v_result2 ->> 'idempotent_replay')::boolean, false) THEN
    RAISE EXCEPTION 'TEST_FAIL: expected idempotent replay';
  END IF;

  IF (v_result2 ->> 'order_id')::uuid <> v_order THEN
    RAISE EXCEPTION 'TEST_FAIL: replay order_id mismatch';
  END IF;

  IF (v_result2 ->> 'total_amount') IS NULL OR (v_result2 ->> 'item_count') IS NULL THEN
    RAISE EXCEPTION 'TEST_FAIL: replay missing totals';
  END IF;

  IF (SELECT COUNT(*) FROM public.pos_checkout_operations WHERE idempotency_key = v_key) <> 1 THEN
    RAISE EXCEPTION 'TEST_FAIL: duplicate pos_checkout_operations';
  END IF;

  RAISE NOTICE 'Phase 6 POS idempotency OK';
END $$;

ROLLBACK;
