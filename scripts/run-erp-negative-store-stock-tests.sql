-- ERP negative store stock (requires migration 20261002240000 applied).
-- order_funnel_reach.user_id → auth.users; use walk-in customer (same as POS tests).
-- Ends with ROLLBACK — no persistent changes.
-- Pass: one row test_result = TEST_PASS: … | Fail: ERROR (TEST_FAIL / TEST_SKIP).
 
BEGIN;
  
DO $$
DECLARE
  v_store uuid;
  v_product uuid;
  v_user uuid;
  v_customer uuid;
  v_order_id uuid;
  v_stock numeric;
  v_walk_in_id uuid := 'a0000000-0000-4000-8000-000000000001';
BEGIN
  SELECT id INTO v_store FROM public.stores WHERE is_active = true ORDER BY name LIMIT 1;
  IF v_store IS NULL THEN
    RAISE EXCEPTION 'TEST_SKIP: no active store';
  END IF;

  SELECT id INTO v_user FROM public.users WHERE role::text IN ('admin', 'manager') LIMIT 1;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'TEST_SKIP: no staff user';
  END IF;

  SELECT id INTO v_product FROM public.products WHERE is_active = true AND item_type = 'goods' LIMIT 1;
  IF v_product IS NULL THEN
    RAISE EXCEPTION 'TEST_SKIP: no goods product';
  END IF;

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
      name = EXCLUDED.name,
      email = EXCLUDED.email;
  END IF;

  v_customer := public.ensure_walk_in_customer();

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_customer) THEN
    RAISE EXCEPTION 'TEST_SKIP: walk-in customer missing in auth.users — run ensure_walk_in migration';
  END IF;

  UPDATE public.app_settings SET allow_negative_store_stock = true WHERE id = 1;

  DELETE FROM public.store_product_inventory
  WHERE store_id = v_store AND product_id = v_product;

  INSERT INTO public.store_product_inventory (store_id, product_id, stock, updated_at)
  VALUES (v_store, v_product, 2, now());

  INSERT INTO public.orders (
    user_id, total_amount, status, payment_status, source, store_id,
    subtotal, tax, discount, inventory_committed
  )
  VALUES (
    v_customer, 100, 'processing', 'pending', 'sales_order', v_store,
    100, 0, 0, false
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items (
    order_id, product_id, quantity, price, final_price, product_name
  )
  VALUES (v_order_id, v_product, 5, 20, 20, 'Neg stock test');

  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  PERFORM public.inventory_apply_order_stock(v_order_id, -1);

  SELECT stock INTO v_stock
  FROM public.store_product_inventory
  WHERE store_id = v_store AND product_id = v_product;

  IF v_stock <> -3 THEN
    RAISE EXCEPTION 'TEST_FAIL: expected stock -3, got %', v_stock;
  END IF;

  PERFORM public.store_product_inventory_apply_delta(v_store, v_product, 3, v_user, false);

  SELECT stock INTO v_stock
  FROM public.store_product_inventory
  WHERE store_id = v_store AND product_id = v_product;

  IF v_stock <> 0 THEN
    RAISE EXCEPTION 'TEST_FAIL: expected stock 0 after receipt, got %', v_stock;
  END IF;

  UPDATE public.app_settings SET allow_negative_store_stock = false WHERE id = 1;

  RAISE NOTICE 'TEST_PASS: erp negative store stock';
END $$;

-- Visible in Supabase "Results" (NOTICE alone often does not show).
SELECT 'TEST_PASS: erp negative store stock' AS test_result;

ROLLBACK;
