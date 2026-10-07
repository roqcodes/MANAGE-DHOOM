-- Integration test runner — run in Supabase SQL Editor AFTER seed-integration-test.sql
-- Uses fixed test IDs from seed. Rolls back destructive checks where noted.

BEGIN;

-- Test constants
-- STORE A: a0000001-0001-4000-8000-000000000001
-- STORE B: a0000002-0002-4000-8000-000000000002
-- VARIANT A (Default): bfa4cbf5-9f95-4e57-9ff0-f44b74ce8aaa
-- VARIANT B (IP 17): 15fb9312-e7cf-4d27-b830-f38b00d3137f
-- ADMIN: first admin user in DB

DO $$
DECLARE
  v_admin uuid;
  v_customer uuid;
  v_order_id uuid;
  v_fulfillment_id uuid;
  v_avail numeric;
  v_stock numeric;
  v_reserved numeric;
BEGIN
  SELECT id INTO v_admin FROM public.users WHERE role::text = 'admin' ORDER BY created_at LIMIT 1;
  SELECT id INTO v_customer FROM public.users WHERE role::text = 'customer' ORDER BY created_at LIMIT 1;

  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'TEST SETUP: no admin user found';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  -- ─── TEST 1: Store isolation (data present per store) ─────────────────────
  PERFORM 1 FROM public.store_inventory si
  JOIN public.stores s ON s.id = si.store_id
  WHERE s.name = 'TEST-STORE-A' AND si.variant_id = 'bfa4cbf5-9f95-4e57-9ff0-f44b74ce8aaa' AND si.stock = 10;
  IF NOT FOUND THEN RAISE EXCEPTION 'TEST 1 FAIL: Store A stock'; END IF;

  PERFORM 1 FROM public.store_inventory si
  JOIN public.stores s ON s.id = si.store_id
  WHERE s.name = 'TEST-STORE-B' AND si.variant_id = 'bfa4cbf5-9f95-4e57-9ff0-f44b74ce8aaa' AND si.stock = 5;
  IF NOT FOUND THEN RAISE EXCEPTION 'TEST 1 FAIL: Store B stock'; END IF;

  RAISE NOTICE 'TEST 1 PASS: per-store stock seeded';

  -- ─── TEST 4 prep: online availability ─────────────────────────────────────
  v_avail := public.get_variant_online_available('bfa4cbf5-9f95-4e57-9ff0-f44b74ce8aaa');
  IF v_avail < 15 THEN
    RAISE EXCEPTION 'TEST 4 FAIL: online available % (expected >= 15)', v_avail;
  END IF;
  RAISE NOTICE 'TEST 4 partial PASS: online available = %', v_avail;

  -- ─── TEST 4: simulate online order reserve (needs customer auth in RPC) ───
  -- Create order + items as postgres, then call reserve with admin if customer null
  IF v_customer IS NULL THEN
    RAISE NOTICE 'TEST 4-8 BLOCKED: no customer user — create a customer account for full online flow';
  ELSE
    INSERT INTO public.orders (user_id, total_amount, status, payment_status, source, fulfillment_status, inventory_reserved, inventory_committed)
    VALUES (v_customer, 100, 'pending', 'not_required', 'online', 'none', false, false)
    RETURNING id INTO v_order_id;

    INSERT INTO public.order_items (order_id, variant_id, quantity, price, final_price, product_name)
    VALUES (v_order_id, 'bfa4cbf5-9f95-4e57-9ff0-f44b74ce8aaa', 3, 10, 10, 'TEST Default');

    -- reserve requires auth.uid() = customer or staff; use perform as admin via direct reserve RPC
    PERFORM public.store_inventory_reserve(
      'a0000001-0001-4000-8000-000000000001',
      'bfa4cbf5-9f95-4e57-9ff0-f44b74ce8aaa',
      3, 'order', v_order_id, v_admin
    );

    SELECT stock, reserved_stock INTO v_stock, v_reserved
    FROM public.store_inventory
    WHERE store_id = 'a0000001-0001-4000-8000-000000000001'
      AND variant_id = 'bfa4cbf5-9f95-4e57-9ff0-f44b74ce8aaa';

    IF v_stock <> 10 OR v_reserved <> 3 THEN
      RAISE EXCEPTION 'TEST 4 FAIL: after reserve stock=% reserved=%', v_stock, v_reserved;
    END IF;
    RAISE NOTICE 'TEST 4 PASS: reserve stock=10 reserved=3';

    -- TEST 8: ship
    INSERT INTO public.order_fulfillments (id, order_id, store_id, status, reserved_at, inventory_committed)
    VALUES (gen_random_uuid(), v_order_id, 'a0000001-0001-4000-8000-000000000001', 'reserved', now(), false)
    RETURNING id INTO v_fulfillment_id;

    INSERT INTO public.order_fulfillment_items (fulfillment_id, variant_id, quantity, reserved_quantity, shipped_quantity)
    VALUES (v_fulfillment_id, 'bfa4cbf5-9f95-4e57-9ff0-f44b74ce8aaa', 3, 3, 0);

    PERFORM public.ship_order_fulfillment(v_fulfillment_id, v_admin);

    SELECT stock, reserved_stock INTO v_stock, v_reserved
    FROM public.store_inventory
    WHERE store_id = 'a0000001-0001-4000-8000-000000000001'
      AND variant_id = 'bfa4cbf5-9f95-4e57-9ff0-f44b74ce8aaa';

    IF v_stock <> 7 OR v_reserved <> 0 THEN
      RAISE EXCEPTION 'TEST 8 FAIL: after ship stock=% reserved=%', v_stock, v_reserved;
    END IF;
    RAISE NOTICE 'TEST 8 PASS: ship stock=7 reserved=0';

    -- idempotency: second ship should no-op
    PERFORM public.ship_order_fulfillment(v_fulfillment_id, v_admin);
    SELECT stock INTO v_stock FROM public.store_inventory
    WHERE store_id = 'a0000001-0001-4000-8000-000000000001' AND variant_id = 'bfa4cbf5-9f95-4e57-9ff0-f44b74ce8aaa';
    IF v_stock <> 7 THEN RAISE EXCEPTION 'TEST 8 FAIL: double ship stock=%', v_stock; END IF;
    RAISE NOTICE 'TEST 8 PASS: ship idempotent';

    -- cleanup test order artifacts
    DELETE FROM public.order_fulfillment_items WHERE fulfillment_id = v_fulfillment_id;
    DELETE FROM public.order_fulfillments WHERE id = v_fulfillment_id;
    DELETE FROM public.order_items WHERE order_id = v_order_id;
    DELETE FROM public.orders WHERE id = v_order_id;
  END IF;

  -- ─── TEST 3: POS manual deduct at store A ─────────────────────────────────
  -- Reset variant A store A to 10/0 for isolated test
  UPDATE public.store_inventory SET stock = 10, reserved_stock = 0
  WHERE store_id = 'a0000001-0001-4000-8000-000000000001'
    AND variant_id = 'bfa4cbf5-9f95-4e57-9ff0-f44b74ce8aaa';

  INSERT INTO public.orders (user_id, total_amount, status, payment_status, source, store_id, inventory_committed)
  VALUES (NULL, 30, 'completed', 'paid', 'manual', 'a0000001-0001-4000-8000-000000000001', false)
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items (order_id, variant_id, quantity, price, final_price, product_name)
  VALUES (v_order_id, 'bfa4cbf5-9f95-4e57-9ff0-f44b74ce8aaa', 3, 10, 10, 'TEST POS');

  PERFORM public.inventory_apply_order_stock(v_order_id, -1);

  SELECT stock INTO v_stock FROM public.store_inventory
  WHERE store_id = 'a0000001-0001-4000-8000-000000000001' AND variant_id = 'bfa4cbf5-9f95-4e57-9ff0-f44b74ce8aaa';

  IF v_stock <> 7 THEN RAISE EXCEPTION 'TEST 3 FAIL: POS stock=%', v_stock; END IF;
  RAISE NOTICE 'TEST 3 PASS: POS deduct stock=7';

  PERFORM public.inventory_apply_order_stock(v_order_id, -1);
  SELECT stock INTO v_stock FROM public.store_inventory
  WHERE store_id = 'a0000001-0001-4000-8000-000000000001' AND variant_id = 'bfa4cbf5-9f95-4e57-9ff0-f44b74ce8aaa';
  IF v_stock <> 7 THEN RAISE EXCEPTION 'TEST 3 FAIL: double deduct stock=%', v_stock; END IF;
  RAISE NOTICE 'TEST 3 PASS: POS idempotent';

  DELETE FROM public.order_items WHERE order_id = v_order_id;
  DELETE FROM public.orders WHERE id = v_order_id;

  -- restore seed levels for variant A
  UPDATE public.store_inventory SET stock = 10, reserved_stock = 0
  WHERE store_id = 'a0000001-0001-4000-8000-000000000001'
    AND variant_id = 'bfa4cbf5-9f95-4e57-9ff0-f44b74ce8aaa';

END $$;

COMMIT;

-- Result grid (re-run seed if stock was left at 7 after manual testing)
SELECT s.name, pv.name AS variant_name, si.stock, si.reserved_stock
FROM public.store_inventory si
JOIN public.stores s ON s.id = si.store_id
JOIN public.product_variants pv ON pv.id = si.variant_id
WHERE s.name LIKE 'TEST-STORE-%'
ORDER BY 1, 2;

-- NOTICE lines (TEST x PASS) appear in the editor Messages tab, not this grid.
