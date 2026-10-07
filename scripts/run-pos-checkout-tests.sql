-- POS checkout integrity tests.
-- Prerequisites: Phase 2 migration applied (complete_pos_counter_sale).
-- Optional: 20261002150000_ensure_walk_in_customer_self_heal (or bootstrap below).
-- Bootstraps walk-in customer + sellable inventory inside the transaction when missing.
-- Ends with ROLLBACK — no persistent changes.

BEGIN;

DO $$
DECLARE
  v_store uuid;
  v_variant uuid;
  v_product uuid;
  v_staff uuid;
  v_key uuid := gen_random_uuid();
  v_key2 uuid := gen_random_uuid();
  v_result jsonb;
  v_order_id uuid;
  v_stock_before numeric;
  v_stock_after numeric;
  v_count integer;
  v_lines jsonb;
  v_sellable numeric;
  v_walk_in_id uuid := 'a0000000-0000-4000-8000-000000000001';
BEGIN
  SELECT id INTO v_staff FROM public.users WHERE role::text IN ('admin', 'manager') LIMIT 1;
  IF v_staff IS NULL THEN
    RAISE EXCEPTION 'TEST_SKIP: no staff user in public.users';
  END IF;

  SELECT id INTO v_store
  FROM public.stores
  WHERE COALESCE(is_active, true) = true
  ORDER BY created_at
  LIMIT 1;

  IF v_store IS NULL THEN
    SELECT id INTO v_store FROM public.stores ORDER BY created_at LIMIT 1;
  END IF;

  IF v_store IS NULL THEN
    RAISE EXCEPTION 'TEST_SKIP: no store row — create a store first';
  END IF;

  -- Walk-in customer (POS guest sales) — same IDs as migration 20260903200000.
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE customer_number = 'WALK-IN' OR email = 'walk-in@buyhub.internal'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_walk_in_id) THEN
      INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data, is_super_admin,
        confirmation_token, recovery_token, email_change_token_new, email_change
      )
      VALUES (
        v_walk_in_id,
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        'walk-in@buyhub.internal',
        extensions.crypt('walk-in-no-login'::text, extensions.gen_salt('bf'::text)),
        now(), now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"name":"Walk-in Customer"}'::jsonb,
        false, '', '', '', ''
      );
    END IF;

    INSERT INTO public.users (
      id, name, email, role, is_verified, customer_number, contact_display_name
    )
    VALUES (
      v_walk_in_id,
      'Walk-in Customer',
      'walk-in@buyhub.internal',
      'customer',
      true,
      'WALK-IN',
      'Walk-in / POS cash sales'
    )
    ON CONFLICT (id) DO UPDATE
    SET
      customer_number = EXCLUDED.customer_number,
      contact_display_name = EXCLUDED.contact_display_name,
      name = EXCLUDED.name;
  END IF;

  PERFORM public.ensure_walk_in_customer();

  -- Phase 1: managers need user_store_access (admins bypass).
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

  SELECT stock - COALESCE(reserved_stock, 0)
  INTO v_sellable
  FROM public.inventory
  WHERE store_id = v_store AND variant_id = v_variant;

  IF COALESCE(v_sellable, 0) < 1 THEN
    UPDATE public.inventory
    SET stock = 10, reserved_stock = 0, updated_at = now()
    WHERE store_id = v_store AND variant_id = v_variant;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);

  SELECT stock - COALESCE(reserved_stock, 0) INTO v_stock_before
  FROM public.inventory
  WHERE store_id = v_store AND variant_id = v_variant;

  v_lines := jsonb_build_array(
    jsonb_build_object(
      'variant_id', v_variant,
      'product_id', v_product,
      'quantity', 1,
      'unit_price', 10,
      'final_price', 10,
      'base_price', 5,
      'margin_amount', 5,
      'product_name', 'POS test line'
    )
  );

  -- 1) Successful checkout
  v_result := public.complete_pos_counter_sale(
    v_key, v_store, v_lines, 10, 0, 0, 10,
    NULL, 'Test buyer', NULL, NULL, NULL, v_staff
  );
  v_order_id := (v_result ->> 'order_id')::uuid;

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'TEST_FAIL: successful checkout returned no order_id';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.pos_checkout_operations WHERE idempotency_key = v_key;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST_FAIL: idempotency row missing';
  END IF;

  -- 2) Duplicate retry (same idempotency key)
  v_result := public.complete_pos_counter_sale(
    v_key, v_store, v_lines, 10, 0, 0, 10,
    NULL, 'Test buyer', NULL, NULL, NULL, v_staff
  );
  IF (v_result ->> 'order_id')::uuid <> v_order_id THEN
    RAISE EXCEPTION 'TEST_FAIL: idempotent replay changed order_id';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.orders WHERE merchant_note ILIKE '%POS counter sale%'
    AND created_at > now() - interval '1 minute';
  -- at least one order; duplicate must not create second for same key
  SELECT COUNT(*) INTO v_count FROM public.pos_checkout_operations WHERE order_id = v_order_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST_FAIL: duplicate checkout created extra idempotency rows';
  END IF;

  SELECT stock - COALESCE(reserved_stock, 0) INTO v_stock_after
  FROM public.inventory
  WHERE store_id = v_store AND variant_id = v_variant;

  IF v_stock_after <> v_stock_before - 1 THEN
    RAISE EXCEPTION 'TEST_FAIL: stock not decremented exactly once (before %, after %)',
      v_stock_before, v_stock_after;
  END IF;

  -- 3) Out of stock (qty exceeds available)
  BEGIN
    PERFORM public.complete_pos_counter_sale(
      v_key2, v_store,
      jsonb_build_array(
        jsonb_build_object(
          'variant_id', v_variant,
          'product_id', v_product,
          'quantity', 99999,
          'unit_price', 10,
          'final_price', 10,
          'base_price', 5,
          'margin_amount', 5,
          'product_name', 'OOS test'
        )
      ),
      10, 0, 0, 10, NULL, NULL, NULL, NULL, NULL, v_staff
    );
    RAISE EXCEPTION 'TEST_FAIL: out-of-stock checkout should have failed';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT ILIKE '%POS_STOCK_UNAVAILABLE%' AND SQLERRM NOT ILIKE '%insufficient%' THEN
        RAISE;
      END IF;
  END;

  IF EXISTS (SELECT 1 FROM public.pos_checkout_operations WHERE idempotency_key = v_key2) THEN
    RAISE EXCEPTION 'TEST_FAIL: failed checkout left idempotency row';
  END IF;

  RAISE NOTICE 'POS checkout tests passed.';
END $$;

ROLLBACK;
