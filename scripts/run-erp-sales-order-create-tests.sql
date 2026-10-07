-- sales_order.create idempotency certification (Phase 5).
-- Requires migrations:
--   20261003120000_erp_client_operations_idempotency.sql
--   20261003140000_erp_sales_order_create_idempotent.sql
--   20261003150000_order_funnel_skip_erp_sales_orders.sql
-- Ends with ROLLBACK.

BEGIN;

DO $$
DECLARE
  v_staff uuid;
  v_store uuid;
  v_customer uuid;
  v_product uuid;
  v_op uuid := gen_random_uuid();
  v_payload jsonb;
  v_hash text;
  v_r1 jsonb;
  v_r2 jsonb;
  v_order1 uuid;
  v_order2 uuid;
  v_cnt int;
BEGIN
  SELECT id INTO v_staff FROM public.users WHERE role::text IN ('admin', 'manager') LIMIT 1;
  IF v_staff IS NULL THEN
    RAISE EXCEPTION 'TEST_SKIP: no staff user';
  END IF;

  SELECT id INTO v_store FROM public.stores WHERE COALESCE(is_active, true) ORDER BY created_at LIMIT 1;
  IF v_store IS NULL THEN
    RAISE EXCEPTION 'TEST_SKIP: no store';
  END IF;

  SELECT u.id INTO v_customer
  FROM public.users u
  WHERE u.role::text = 'customer'
  ORDER BY u.created_at
  LIMIT 1;
  IF v_customer IS NULL THEN
    SELECT u.id INTO v_customer
    FROM public.users u
    WHERE u.id <> v_staff
    ORDER BY u.created_at
    LIMIT 1;
  END IF;
  IF v_customer IS NULL THEN
    RAISE EXCEPTION 'TEST_SKIP: no customer user';
  END IF;

  SELECT p.id INTO v_product
  FROM public.products p
  INNER JOIN public.store_product_inventory spi
    ON spi.product_id = p.id AND spi.store_id = v_store
  WHERE COALESCE(p.price, 0) > 0
  ORDER BY p.created_at
  LIMIT 1;

  IF v_product IS NULL THEN
    RAISE NOTICE 'SKIP: sales_order.create replay test (no priced product with store inventory)';
    RETURN;
  END IF;

  IF NOT public.user_has_store_access(v_staff, v_store) THEN
    INSERT INTO public.user_store_access (user_id, store_id)
    VALUES (v_staff, v_store)
    ON CONFLICT DO NOTHING;
  END IF;

  v_payload := jsonb_build_object(
    'userId', v_customer::text,
    'subtotal', 10,
    'tax', 0,
    'discount', 0,
    'totalAmount', 10,
    'taxInclusive', true,
    'items', jsonb_build_array(
      jsonb_build_object(
        'productId', v_product::text,
        'quantity', 1,
        'unitPrice', 10,
        'taxRatePercent', 0
      )
    )
  );

  v_hash := public.erp_payload_hash(v_payload);

  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  v_r1 := public.run_erp_client_idempotent_operation(
    v_op, 'sales_order.create', v_hash, v_payload, v_store, 'term-so'
  );
  IF COALESCE((v_r1 ->> 'idempotentReplay')::boolean, true) THEN
    RAISE EXCEPTION 'FAIL: first sales_order.create must not replay';
  END IF;
  v_order1 := (v_r1 -> 'result' ->> 'orderId')::uuid;

  v_r2 := public.run_erp_client_idempotent_operation(
    v_op, 'sales_order.create', v_hash, v_payload, v_store, 'term-so'
  );
  IF NOT COALESCE((v_r2 ->> 'idempotentReplay')::boolean, false) THEN
    RAISE EXCEPTION 'FAIL: replay must return idempotentReplay=true';
  END IF;
  v_order2 := (v_r2 -> 'result' ->> 'orderId')::uuid;

  IF v_order1 IS DISTINCT FROM v_order2 THEN
    RAISE EXCEPTION 'FAIL: replay must return same orderId';
  END IF;

  SELECT COUNT(*) INTO v_cnt FROM public.orders WHERE id = v_order1 AND source = 'sales_order';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'FAIL: expected exactly one sales order row';
  END IF;

  RAISE NOTICE 'sales_order.create idempotency certification PASS';
END;
$$;

ROLLBACK;
