-- sales_order.cancel idempotency certification (Phase 7).
-- Requires migrations through 20261003170000_erp_sales_order_cancel_idempotent.sql
-- Ends with ROLLBACK.

BEGIN;

DO $$
DECLARE
  v_staff uuid;
  v_store uuid;
  v_customer uuid;
  v_product uuid;
  v_create_op uuid := gen_random_uuid();
  v_cancel_op uuid := gen_random_uuid();
  v_create_payload jsonb;
  v_cancel_payload jsonb;
  v_create_hash text;
  v_cancel_hash text;
  v_create_result jsonb;
  v_cancel_result jsonb;
  v_replay jsonb;
  v_order_id uuid;
  v_spi_before numeric;
  v_spi_after_cancel numeric;
  v_spi_after_replay numeric;
  v_status text;
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
  WHERE COALESCE(p.price, 0) > 0 AND COALESCE(spi.stock, 0) >= 2
  ORDER BY p.created_at
  LIMIT 1;

  IF v_product IS NULL THEN
    RAISE NOTICE 'SKIP: sales_order.cancel test (need product with stock >= 2)';
    RETURN;
  END IF;

  IF NOT public.user_has_store_access(v_staff, v_store) THEN
    INSERT INTO public.user_store_access (user_id, store_id)
    VALUES (v_staff, v_store)
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT stock INTO v_spi_before
  FROM public.store_product_inventory
  WHERE store_id = v_store AND product_id = v_product;

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
    v_create_op, 'sales_order.create', v_create_hash, v_create_payload, v_store, 'term-cancel'
  );
  v_order_id := (v_create_result -> 'result' ->> 'orderId')::uuid;

  v_cancel_payload := jsonb_build_object('orderId', v_order_id::text);
  v_cancel_hash := public.erp_payload_hash(v_cancel_payload);

  v_cancel_result := public.run_erp_client_idempotent_operation(
    v_cancel_op, 'sales_order.cancel', v_cancel_hash, v_cancel_payload, v_store, 'term-cancel'
  );
  IF COALESCE((v_cancel_result ->> 'idempotentReplay')::boolean, true) THEN
    RAISE EXCEPTION 'FAIL: first cancel must not replay';
  END IF;

  SELECT status INTO v_status FROM public.orders WHERE id = v_order_id;
  IF v_status <> 'cancelled' THEN
    RAISE EXCEPTION 'FAIL: order must be cancelled';
  END IF;

  SELECT stock INTO v_spi_after_cancel
  FROM public.store_product_inventory
  WHERE store_id = v_store AND product_id = v_product;

  IF v_spi_after_cancel IS DISTINCT FROM v_spi_before THEN
    RAISE EXCEPTION 'FAIL: cancel must restore inventory to pre-create level';
  END IF;

  v_replay := public.run_erp_client_idempotent_operation(
    v_cancel_op, 'sales_order.cancel', v_cancel_hash, v_cancel_payload, v_store, 'term-cancel'
  );
  IF NOT COALESCE((v_replay ->> 'idempotentReplay')::boolean, false) THEN
    RAISE EXCEPTION 'FAIL: cancel replay must be idempotent';
  END IF;

  SELECT stock INTO v_spi_after_replay
  FROM public.store_product_inventory
  WHERE store_id = v_store AND product_id = v_product;

  IF v_spi_after_replay IS DISTINCT FROM v_spi_after_cancel THEN
    RAISE EXCEPTION 'FAIL: replay must not restore inventory again';
  END IF;

  BEGIN
    PERFORM public.run_erp_client_idempotent_operation(
      v_cancel_op,
      'sales_order.cancel',
      public.erp_payload_hash(jsonb_build_object('orderId', v_order_id::text, 'note', 'x')),
      jsonb_build_object('orderId', v_order_id::text, 'note', 'x'),
      v_store,
      'term-cancel'
    );
    RAISE EXCEPTION 'FAIL: payload hash conflict must raise';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%ERP_CLIENT_PAYLOAD_HASH_CONFLICT%' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    PERFORM public.run_erp_client_idempotent_operation(
      v_cancel_op, 'sales_order.create', v_cancel_hash, v_cancel_payload, v_store, 'term-cancel'
    );
    RAISE EXCEPTION 'FAIL: operation type conflict must raise';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%ERP_CLIENT_OPERATION_TYPE_CONFLICT%' THEN
        RAISE;
      END IF;
  END;

  RAISE NOTICE 'sales_order.cancel idempotency certification PASS';
END;
$$;

ROLLBACK;
