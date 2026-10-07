-- sales_order.update idempotency certification (Phase 6).
-- Requires migrations through 20261003160000_erp_sales_order_update_idempotent.sql
-- Ends with ROLLBACK.

BEGIN;

DO $$
DECLARE
  v_staff uuid;
  v_store uuid;
  v_customer uuid;
  v_product uuid;
  v_create_op uuid := gen_random_uuid();
  v_update_op uuid := gen_random_uuid();
  v_create_payload jsonb;
  v_update_payload jsonb;
  v_create_hash text;
  v_update_hash text;
  v_create_result jsonb;
  v_update_result jsonb;
  v_replay jsonb;
  v_order_id uuid;
  v_item_qty int;
  v_spi_before numeric;
  v_spi_after numeric;
BEGIN
  SELECT id INTO v_staff FROM public.users WHERE role::text IN ('admin', 'manager') LIMIT 1;
  IF v_staff IS NULL THEN
    RAISE EXCEPTION 'TEST_SKIP: no staff user';
  END IF;

  SELECT id INTO v_store FROM public.stores WHERE COALESCE(is_active, true) ORDER BY created_at LIMIT 1;
  IF v_store IS NULL THEN
    RAISE EXCEPTION 'TEST_SKIP: no store';
  END IF;

  SELECT id INTO v_customer FROM public.users WHERE role::text = 'customer' LIMIT 1;
  IF v_customer IS NULL THEN
    SELECT id INTO v_customer FROM public.users WHERE id <> v_staff LIMIT 1;
  END IF;

  SELECT p.id INTO v_product
  FROM public.products p
  INNER JOIN public.store_product_inventory spi
    ON spi.product_id = p.id AND spi.store_id = v_store
  WHERE COALESCE(p.price, 0) > 0
  ORDER BY p.created_at
  LIMIT 1;

  IF v_product IS NULL THEN
    RAISE NOTICE 'SKIP: sales_order.update test (no priced product with store inventory)';
    RETURN;
  END IF;

  IF NOT public.user_has_store_access(v_staff, v_store) THEN
    INSERT INTO public.user_store_access (user_id, store_id)
    VALUES (v_staff, v_store)
    ON CONFLICT DO NOTHING;
  END IF;

  v_create_payload := jsonb_build_object(
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

  v_create_hash := public.erp_payload_hash(v_create_payload);

  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  v_create_result := public.run_erp_client_idempotent_operation(
    v_create_op, 'sales_order.create', v_create_hash, v_create_payload, v_store, 'term-upd'
  );
  v_order_id := (v_create_result -> 'result' ->> 'orderId')::uuid;

  SELECT stock INTO v_spi_before
  FROM public.store_product_inventory
  WHERE store_id = v_store AND product_id = v_product;

  v_update_payload := jsonb_build_object(
    'orderId', v_order_id::text,
    'userId', v_customer::text,
    'subtotal', 20,
    'tax', 0,
    'discount', 0,
    'totalAmount', 20,
    'taxInclusive', true,
    'items', jsonb_build_array(
      jsonb_build_object(
        'productId', v_product::text,
        'quantity', 2,
        'unitPrice', 10,
        'taxRatePercent', 0
      )
    )
  );
  v_update_hash := public.erp_payload_hash(v_update_payload);

  v_update_result := public.run_erp_client_idempotent_operation(
    v_update_op, 'sales_order.update', v_update_hash, v_update_payload, v_store, 'term-upd'
  );
  IF COALESCE((v_update_result ->> 'idempotentReplay')::boolean, true) THEN
    RAISE EXCEPTION 'FAIL: first update must not replay';
  END IF;

  SELECT quantity INTO v_item_qty
  FROM public.order_items
  WHERE order_id = v_order_id AND product_id = v_product
  LIMIT 1;
  IF v_item_qty <> 2 THEN
    RAISE EXCEPTION 'FAIL: update must set quantity to 2';
  END IF;

  v_replay := public.run_erp_client_idempotent_operation(
    v_update_op, 'sales_order.update', v_update_hash, v_update_payload, v_store, 'term-upd'
  );
  IF NOT COALESCE((v_replay ->> 'idempotentReplay')::boolean, false) THEN
    RAISE EXCEPTION 'FAIL: update replay must return idempotentReplay=true';
  END IF;

  SELECT stock INTO v_spi_after
  FROM public.store_product_inventory
  WHERE store_id = v_store AND product_id = v_product;

  IF v_spi_after IS DISTINCT FROM v_spi_before - 1 THEN
    RAISE EXCEPTION 'FAIL: replay must not change inventory again (expected net -1 from create+update)';
  END IF;

  BEGIN
    PERFORM public.run_erp_client_idempotent_operation(
      v_update_op,
      'sales_order.update',
      public.erp_payload_hash(jsonb_set(v_update_payload, '{totalAmount}', '99')),
      jsonb_set(v_update_payload, '{totalAmount}', '99'),
      v_store,
      'term-upd'
    );
    RAISE EXCEPTION 'FAIL: payload hash conflict must raise';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%ERP_CLIENT_PAYLOAD_HASH_CONFLICT%' THEN
        RAISE;
      END IF;
  END;

  RAISE NOTICE 'sales_order.update idempotency certification PASS';
END;
$$;

ROLLBACK;
